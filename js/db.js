function normalizeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function calculateTaxBreakdown(mode, taxRate, enteredAmount) {
  const rate = normalizeNumber(taxRate);
  const input = normalizeNumber(enteredAmount);

  let baseAmount = 0;
  let taxAmount = 0;
  let occurrenceAmount = 0;

  if (mode === "tax_included") {
    if (rate === 0) {
      baseAmount = input;
      taxAmount = 0;
    } else {
      baseAmount = Math.round(input / (1 + rate / 100));
      taxAmount = input - baseAmount;
    }
    occurrenceAmount = input;
  } else {
    baseAmount = input;
    taxAmount = Math.round(baseAmount * rate / 100);
    occurrenceAmount = baseAmount + taxAmount;
  }

  const billedAmount = occurrenceAmount;
  return {
    mode,
    taxRate: rate,
    baseAmount,
    taxAmount,
    occurrenceAmount,
    billedAmount: Math.max(0, billedAmount),
  };
}

async function getInvoiceNumberConfig() {
  const ref = db.collection("settings").doc("invoiceNumber");
  const doc = await ref.get();
  if (!doc.exists) {
    return { startNumber: null, lastNumber: null };
  }
  const data = doc.data() || {};
  return {
    startNumber: Number.isFinite(Number(data.startNumber)) ? Number(data.startNumber) : null,
    lastNumber: Number.isFinite(Number(data.lastNumber)) ? Number(data.lastNumber) : null,
  };
}

async function saveInvoiceNumberStart(startNumber) {
  const numericStart = normalizeNumber(startNumber);
  if (numericStart <= 0) {
    throw new Error("開始番号は1以上で設定してください");
  }
  await db.collection("settings").doc("invoiceNumber").set({
    startNumber: numericStart,
    lastNumber: numericStart - 1,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

const DEFAULT_INVOICE_FORMAT = {
  orgName: "一般財団法人全日本大学バスケットボール連盟",
  zip: "150-0002",
  address1: "東京都渋谷区渋谷3-17-2",
  address2: "清澤ビル6階",
  tel: "03-5459-3557",
  fax: "03-5459-3558",
  email: "jubf.zaimu@gmail.com",
  registrationNo: "T8-0110-0500-7501",
  bankName: "みずほ銀行",
  branchName: "渋谷中央支店",
  accountType: "普通預金",
  accountNumber: "1870255",
  accountNameKana: "ザイ）ゼンニホンダイガクバスケットボールレンメイ ダイヒョウ",
  accountHolder: "ウエマツマサヒロ",
};

function normalizeFormatText(value) {
  return String(value ?? "").replace(/\r\n/g, "\n").replace(/^\s+|\s+$/g, "");
}

function blankInvoiceFormat() {
  const blank = {};
  Object.keys(DEFAULT_INVOICE_FORMAT).forEach((key) => {
    blank[key] = "";
  });
  return blank;
}

function mergeInvoiceFormat(data, useDefaults = true) {
  const src = data && typeof data === "object" ? data : {};
  const merged = useDefaults ? { ...DEFAULT_INVOICE_FORMAT } : blankInvoiceFormat();
  Object.keys(DEFAULT_INVOICE_FORMAT).forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(src, key) || src[key] == null) return;
    merged[key] = normalizeFormatText(src[key]);
  });
  return merged;
}

async function getInvoiceFormat() {
  const doc = await db.collection("settings").doc("invoiceFormat").get();
  if (!doc.exists) return { ...DEFAULT_INVOICE_FORMAT };
  return mergeInvoiceFormat(doc.data(), false);
}

async function saveInvoiceFormat(format) {
  const payload = mergeInvoiceFormat(format, false);
  await db.collection("settings").doc("invoiceFormat").set({
    ...payload,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
  return payload;
}

async function reserveNextInvoiceNumber() {
  const ref = db.collection("settings").doc("invoiceNumber");
  const next = await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const data = doc.exists ? (doc.data() || {}) : {};
    const startNumber = Number.isFinite(Number(data.startNumber)) ? Number(data.startNumber) : null;
    const lastNumber = Number.isFinite(Number(data.lastNumber)) ? Number(data.lastNumber) : null;
    if (!startNumber) {
      throw new Error("開始番号が未設定です。先に開始番号を保存してください。");
    }
    const nextNo = lastNumber === null ? startNumber : lastNumber + 1;
    tx.set(ref, {
      startNumber,
      lastNumber: nextNo,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return nextNo;
  });
  return String(next);
}

async function syncInvoiceNumberIfNeeded(invoiceNo) {
  const numericNo = normalizeNumber(invoiceNo);
  if (numericNo <= 0) return;
  const ref = db.collection("settings").doc("invoiceNumber");
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) return;
    const data = doc.data() || {};
    const startNumber = Number.isFinite(Number(data.startNumber)) ? Number(data.startNumber) : null;
    const lastNumber = Number.isFinite(Number(data.lastNumber)) ? Number(data.lastNumber) : null;
    if (!startNumber) return;
    if (lastNumber === null || numericNo > lastNumber) {
      tx.set(ref, {
        lastNumber: numericNo,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  });
}

async function getRecentInvoices(limitCount) {
  const snap = await db
    .collection("invoices")
    .orderBy("issueDate", "desc")
    .limit(limitCount || 100)
    .get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function getNextInvoiceNumberFromInvoices() {
  const snap = await db.collection("invoices").get();
  let maxNo = 0;

  snap.docs.forEach((doc) => {
    const data = doc.data() || {};
    const raw = String(data.invoiceNo || "").trim();
    if (!/^\d+$/.test(raw)) return;
    const num = Number(raw);
    if (Number.isFinite(num) && num > maxNo) {
      maxNo = num;
    }
  });

  return String(maxNo + 1);
}

async function saveInvoice(invoice) {
  const payload = {
    ...invoice,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  if (!invoice.createdAt) {
    payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
  }

  if (invoice.id) {
    const id = invoice.id;
    delete payload.id;
    await db.collection("invoices").doc(id).set(payload, { merge: true });
    return id;
  }

  const ref = await db.collection("invoices").add(payload);
  return ref.id;
}

function deriveStatus(totalPaid, billedAmount) {
  const paid = normalizeNumber(totalPaid);
  const billed = normalizeNumber(billedAmount);
  if (billed <= 0) return "paid";
  return paid >= billed ? "paid" : "unpaid";
}

function normalizeClientKey(clientName) {
  const raw = String(clientName || "").trim();
  if (!raw) return "_unknown";
  return raw.replace(/[\\/]/g, "_").slice(0, 150);
}

function summarizePayments(paymentDocs) {
  let totalCollected = 0;
  let totalRefunded = 0;
  let movedToDeposit = 0;
  let depositApplied = 0;
  let collectionDate = "";
  let refundDate = "";

  paymentDocs.forEach((data) => {
    const type = data.type || "collection";
    const amount = normalizeNumber(data.amount);
    const dateIso = typeof normalizeDateInput === "function"
      ? normalizeDateInput(data.paidDate)
      : String(data.paidDate || "").trim();

    if (type === "refund") {
      totalRefunded += amount;
      if (dateIso && (!refundDate || dateIso > refundDate)) {
        refundDate = dateIso;
      }
    } else if (type === "to_deposit") {
      movedToDeposit += amount;
    } else if (type === "from_deposit") {
      depositApplied += amount;
      if (dateIso && (!collectionDate || dateIso > collectionDate)) {
        collectionDate = dateIso;
      }
    } else {
      totalCollected += amount;
      if (dateIso && (!collectionDate || dateIso > collectionDate)) {
        collectionDate = dateIso;
      }
    }
  });

  const totalPaid = totalCollected + depositApplied - totalRefunded - movedToDeposit;
  return {
    totalCollected,
    totalRefunded,
    movedToDeposit,
    depositApplied,
    totalPaid,
    collectionDate,
    refundDate,
  };
}

async function getClientDepositBalance(clientName) {
  const key = normalizeClientKey(clientName);
  const doc = await db.collection("clientDeposits").doc(key).get();
  if (!doc.exists) return 0;
  return normalizeNumber(doc.data().balance);
}

async function getAllClientDeposits() {
  const snap = await db.collection("clientDeposits").get();
  return snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .map((row) => ({
      ...row,
      balance: normalizeNumber(row.balance),
    }))
    .filter((row) => row.balance > 0)
    .sort((a, b) => String(a.clientName || "").localeCompare(String(b.clientName || ""), "ja"));
}

async function moveOverpaymentToDeposit(invoiceId, amount, paidDate) {
  const normalized = normalizeNumber(amount);
  if (normalized <= 0) {
    throw new Error("預り金への移動額は0より大きい必要があります");
  }

  const invoiceRef = db.collection("invoices").doc(invoiceId);
  const invoiceDoc = await invoiceRef.get();
  if (!invoiceDoc.exists) {
    throw new Error("対象の請求書が見つかりません");
  }

  const invoice = invoiceDoc.data();
  const clientName = String(invoice.clientName || "").trim();
  if (!clientName) {
    throw new Error("取引先名がないため預り金にできません");
  }

  const billedAmount = normalizeNumber(invoice.billedAmount);
  const totalPaid = normalizeNumber(invoice.totalPaid);
  const overpaid = Math.max(0, totalPaid - billedAmount);
  if (normalized > overpaid) {
    throw new Error(`過払い分（${overpaid}円）を超えて預り金に移動できません`);
  }

  const depositRef = db.collection("clientDeposits").doc(normalizeClientKey(clientName));

  await db.runTransaction(async (tx) => {
    const depDoc = await tx.get(depositRef);
    const currentBalance = depDoc.exists ? normalizeNumber(depDoc.data().balance) : 0;

    tx.set(depositRef, {
      clientName,
      balance: currentBalance + normalized,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    const paymentRef = db.collection("payments").doc();
    tx.set(paymentRef, {
      invoiceId,
      clientName,
      type: "to_deposit",
      amount: normalized,
      paidDate,
      note: "",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  });

  return syncInvoicePaymentSummary(invoiceId);
}

async function applyDepositToInvoice(invoiceId, amount, paidDate) {
  const normalized = normalizeNumber(amount);
  if (normalized <= 0) {
    throw new Error("充当額は0より大きい必要があります");
  }

  const invoiceRef = db.collection("invoices").doc(invoiceId);
  const invoiceDoc = await invoiceRef.get();
  if (!invoiceDoc.exists) {
    throw new Error("対象の請求書が見つかりません");
  }

  const invoice = invoiceDoc.data();
  const clientName = String(invoice.clientName || "").trim();
  if (!clientName) {
    throw new Error("取引先名がないため預り金を充当できません");
  }

  const billedAmount = normalizeNumber(invoice.billedAmount);
  const totalPaid = normalizeNumber(invoice.totalPaid);
  const remaining = Math.max(0, billedAmount - totalPaid);
  if (remaining <= 0) {
    throw new Error("この請求書に未回収残高がありません");
  }
  if (normalized > remaining) {
    throw new Error(`充当額が未回収残高（${remaining}円）を超えています`);
  }

  const depositRef = db.collection("clientDeposits").doc(normalizeClientKey(clientName));

  await db.runTransaction(async (tx) => {
    const depDoc = await tx.get(depositRef);
    const currentBalance = depDoc.exists ? normalizeNumber(depDoc.data().balance) : 0;
    if (normalized > currentBalance) {
      throw new Error(`預り金残高（${currentBalance}円）が不足しています`);
    }

    tx.set(depositRef, {
      clientName,
      balance: currentBalance - normalized,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    const paymentRef = db.collection("payments").doc();
    tx.set(paymentRef, {
      invoiceId,
      clientName,
      type: "from_deposit",
      amount: normalized,
      paidDate,
      note: "",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  });

  return syncInvoicePaymentSummary(invoiceId);
}

async function getPaymentsByInvoiceId(invoiceId) {
  const snap = await db
    .collection("payments")
    .where("invoiceId", "==", invoiceId)
    .get();
  return snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => {
      const ad = String(a.paidDate || "");
      const bd = String(b.paidDate || "");
      return bd.localeCompare(ad);
    });
}

async function syncInvoicePaymentSummary(invoiceId) {
  const invoiceRef = db.collection("invoices").doc(invoiceId);
  const invoiceDoc = await invoiceRef.get();
  if (!invoiceDoc.exists) {
    throw new Error("対象の請求書が見つかりません");
  }

  const invoice = invoiceDoc.data();
  const payments = await getPaymentsByInvoiceId(invoiceId);
  const summary = summarizePayments(payments);
  const billedAmount = normalizeNumber(invoice.billedAmount);

  await invoiceRef.update({
    totalPaid: summary.totalPaid,
    totalCollected: summary.totalCollected,
    totalRefunded: summary.totalRefunded,
    collectionDate: summary.collectionDate || "",
    refundDate: summary.refundDate || "",
    status: deriveStatus(summary.totalPaid, billedAmount),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });

  return summary;
}

async function setInvoiceCollectionDate(invoiceId, paidDate) {
  const iso = typeof normalizeDateInput === "function"
    ? normalizeDateInput(paidDate)
    : String(paidDate || "").trim();
  if (!iso) {
    throw new Error("入金日の形式が不正です");
  }

  const invoiceRef = db.collection("invoices").doc(invoiceId);
  const invoiceDoc = await invoiceRef.get();
  if (!invoiceDoc.exists) {
    throw new Error("対象の請求書が見つかりません");
  }

  const payments = await getPaymentsByInvoiceId(invoiceId);
  const collectionPayments = payments.filter((p) => {
    const type = p.type || "collection";
    return type === "collection" || type === "from_deposit";
  });

  if (collectionPayments.length > 0) {
    const batch = db.batch();
    collectionPayments.forEach((p) => {
      batch.update(db.collection("payments").doc(p.id), { paidDate: iso });
    });
    await batch.commit();
    return syncInvoicePaymentSummary(invoiceId);
  }

  await invoiceRef.update({
    collectionDate: iso,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

async function addCollectionPayment(invoiceId, amount, paidDate, note) {
  const normalized = normalizeNumber(amount);
  if (normalized <= 0) {
    throw new Error("回収額は0より大きい必要があります");
  }

  const invoiceRef = db.collection("invoices").doc(invoiceId);
  const invoiceDoc = await invoiceRef.get();
  if (!invoiceDoc.exists) {
    throw new Error("対象の請求書が見つかりません");
  }

  await db.collection("payments").add({
    invoiceId,
    type: "collection",
    amount: normalized,
    paidDate,
    note: note || "",
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });

  return syncInvoicePaymentSummary(invoiceId);
}

async function addRefundPayment(invoiceId, amount, paidDate, note) {
  const normalized = normalizeNumber(amount);
  if (normalized <= 0) {
    throw new Error("返金額は0より大きい必要があります");
  }

  const invoiceRef = db.collection("invoices").doc(invoiceId);
  const invoiceDoc = await invoiceRef.get();
  if (!invoiceDoc.exists) {
    throw new Error("対象の請求書が見つかりません");
  }

  const invoice = invoiceDoc.data();
  const currentPaid = normalizeNumber(invoice.totalPaid);
  if (normalized > currentPaid) {
    throw new Error(`返金額が回収済み額（${currentPaid}円）を超えています`);
  }

  await db.collection("payments").add({
    invoiceId,
    type: "refund",
    amount: normalized,
    paidDate,
    note: note || "",
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });

  return syncInvoicePaymentSummary(invoiceId);
}

async function addPayment(invoiceId, amount, paidDate, note) {
  return addCollectionPayment(invoiceId, amount, paidDate, note);
}

async function clearInvoicePayments(invoiceId) {
  const invoiceRef = db.collection("invoices").doc(invoiceId);
  const invoiceDoc = await invoiceRef.get();
  if (!invoiceDoc.exists) {
    throw new Error("対象の請求書が見つかりません");
  }

  const invoice = invoiceDoc.data();
  const clientName = String(invoice.clientName || "").trim();
  const paymentSnapshot = await db
    .collection("payments")
    .where("invoiceId", "==", invoiceId)
    .get();

  if (clientName && paymentSnapshot.size > 0) {
    const depositRef = db.collection("clientDeposits").doc(normalizeClientKey(clientName));
    await db.runTransaction(async (tx) => {
      const depDoc = await tx.get(depositRef);
      let balance = depDoc.exists ? normalizeNumber(depDoc.data().balance) : 0;
      paymentSnapshot.docs.forEach((doc) => {
        const p = doc.data();
        const amt = normalizeNumber(p.amount);
        if (p.type === "to_deposit") balance -= amt;
        if (p.type === "from_deposit") balance += amt;
      });
      if (balance < 0) {
        throw new Error("預り金残高がマイナスになるため取り消せません。先に他請求の預り金充当を確認してください。");
      }
      tx.set(depositRef, {
        clientName,
        balance,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      paymentSnapshot.docs.forEach((doc) => tx.delete(doc.ref));
      tx.update(invoiceRef, {
        totalPaid: 0,
        totalCollected: 0,
        totalRefunded: 0,
        collectionDate: "",
        refundDate: "",
        status: "unpaid",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    });
    return paymentSnapshot.size;
  }

  const batch = db.batch();
  paymentSnapshot.docs.forEach((doc) => batch.delete(doc.ref));
  batch.update(invoiceRef, {
    totalPaid: 0,
    totalCollected: 0,
    totalRefunded: 0,
    collectionDate: "",
    refundDate: "",
    status: "unpaid",
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
  await batch.commit();
  return paymentSnapshot.size;
}

async function deleteInvoiceWithPayments(invoiceId) {
  const invoiceRef = db.collection("invoices").doc(invoiceId);
  const invoiceDoc = await invoiceRef.get();
  if (!invoiceDoc.exists) {
    throw new Error("対象の請求書が見つかりません");
  }

  const invoice = invoiceDoc.data();
  const clientName = String(invoice.clientName || "").trim();
  const paymentSnapshot = await db
    .collection("payments")
    .where("invoiceId", "==", invoiceId)
    .get();

  const hasDepositPayments = paymentSnapshot.docs.some((doc) => {
    const t = doc.data().type;
    return t === "to_deposit" || t === "from_deposit";
  });

  if (clientName && hasDepositPayments) {
    const depositRef = db.collection("clientDeposits").doc(normalizeClientKey(clientName));
    await db.runTransaction(async (tx) => {
      const depDoc = await tx.get(depositRef);
      let balance = depDoc.exists ? normalizeNumber(depDoc.data().balance) : 0;
      paymentSnapshot.docs.forEach((doc) => {
        const p = doc.data();
        const amt = normalizeNumber(p.amount);
        if (p.type === "to_deposit") balance -= amt;
        if (p.type === "from_deposit") balance += amt;
      });
      if (balance < 0) {
        throw new Error("預り金残高がマイナスになるため削除できません。先に他請求の預り金充当を確認してください。");
      }
      tx.set(depositRef, {
        clientName,
        balance,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      paymentSnapshot.docs.forEach((doc) => tx.delete(doc.ref));
      tx.delete(invoiceRef);
    });
    return paymentSnapshot.size;
  }

  const batch = db.batch();
  paymentSnapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  batch.delete(invoiceRef);
  await batch.commit();

  return paymentSnapshot.size;
}

async function getPaymentById(paymentId) {
  const doc = await db.collection("payments").doc(paymentId).get();
  if (!doc.exists) {
    throw new Error("対象の入出金履歴が見つかりません");
  }
  return { id: doc.id, ...doc.data() };
}

async function deletePaymentEntry(paymentId) {
  const payment = await getPaymentById(paymentId);
  const invoiceId = payment.invoiceId;
  const type = payment.type || "collection";
  const amount = normalizeNumber(payment.amount);
  const paymentRef = db.collection("payments").doc(paymentId);

  if (type === "to_deposit" || type === "from_deposit") {
    const invoiceDoc = await db.collection("invoices").doc(invoiceId).get();
    const clientName = String(
      payment.clientName || (invoiceDoc.exists ? invoiceDoc.data().clientName : "") || ""
    ).trim();
    const depositRef = db.collection("clientDeposits").doc(normalizeClientKey(clientName));
    await db.runTransaction(async (tx) => {
      const depDoc = await tx.get(depositRef);
      let balance = depDoc.exists ? normalizeNumber(depDoc.data().balance) : 0;
      if (type === "to_deposit") balance -= amount;
      if (type === "from_deposit") balance += amount;
      if (balance < 0) {
        throw new Error("預り金残高がマイナスになるため取り消せません");
      }
      tx.set(depositRef, {
        clientName,
        balance,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      tx.delete(paymentRef);
    });
  } else {
    await paymentRef.delete();
  }

  return syncInvoicePaymentSummary(invoiceId);
}

async function updatePaymentEntry(paymentId, patch) {
  const payment = await getPaymentById(paymentId);
  const invoiceId = payment.invoiceId;
  const type = payment.type || "collection";
  const oldAmount = normalizeNumber(payment.amount);

  const update = { updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
  if (patch.paidDate !== undefined) {
    const iso = typeof normalizeDateInput === "function"
      ? normalizeDateInput(patch.paidDate)
      : String(patch.paidDate || "").trim();
    if (!iso) {
      throw new Error("日付の形式が不正です");
    }
    update.paidDate = iso;
  }
  if (patch.note !== undefined) {
    update.note = String(patch.note || "");
  }
  let newAmount = oldAmount;
  if (patch.amount !== undefined) {
    newAmount = normalizeNumber(patch.amount);
    if (newAmount <= 0) {
      throw new Error("金額は0より大きい必要があります");
    }
    update.amount = newAmount;
  }

  const paymentRef = db.collection("payments").doc(paymentId);
  const amountChanged = newAmount !== oldAmount;

  if (amountChanged && (type === "to_deposit" || type === "from_deposit")) {
    const invoiceDoc = await db.collection("invoices").doc(invoiceId).get();
    const clientName = String(
      payment.clientName || (invoiceDoc.exists ? invoiceDoc.data().clientName : "") || ""
    ).trim();
    const depositRef = db.collection("clientDeposits").doc(normalizeClientKey(clientName));
    await db.runTransaction(async (tx) => {
      const depDoc = await tx.get(depositRef);
      let balance = depDoc.exists ? normalizeNumber(depDoc.data().balance) : 0;
      const delta = newAmount - oldAmount;
      if (type === "to_deposit") balance += delta;
      if (type === "from_deposit") balance -= delta;
      if (balance < 0) {
        throw new Error("預り金残高がマイナスになるため変更できません");
      }
      tx.set(depositRef, {
        clientName,
        balance,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      tx.update(paymentRef, update);
    });
  } else {
    await paymentRef.update(update);
  }

  return syncInvoicePaymentSummary(invoiceId);
}

async function updateInvoiceMemo(invoiceId, memo) {
  const invoiceRef = db.collection("invoices").doc(invoiceId);
  await invoiceRef.update({
    memo: String(memo || ""),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

async function updateInvoiceSubject(invoiceId, subjectName) {
  const invoiceRef = db.collection("invoices").doc(invoiceId);
  await invoiceRef.update({
    subjectName: (subjectName || "").trim(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

async function settleInvoiceFull(invoiceId, paidDate, note) {
  const invoiceRef = db.collection("invoices").doc(invoiceId);
  const invoiceDoc = await invoiceRef.get();
  if (!invoiceDoc.exists) {
    throw new Error("対象の請求書が見つかりません");
  }

  const invoice = invoiceDoc.data();
  const billedAmount = normalizeNumber(invoice.billedAmount);
  const currentPaid = normalizeNumber(invoice.totalPaid);
  const remaining = Math.max(0, billedAmount - currentPaid);

  if (remaining <= 0) {
    return 0;
  }

  await addCollectionPayment(invoiceId, remaining, paidDate, note || "全額回収");
  return remaining;
}

async function updateInvoiceData(invoiceId, patch) {
  const invoiceRef = db.collection("invoices").doc(invoiceId);
  const invoiceDoc = await invoiceRef.get();
  if (!invoiceDoc.exists) {
    throw new Error("対象の請求書が見つかりません");
  }

  const current = invoiceDoc.data();
  const billedAmount = patch.billedAmount !== undefined
    ? normalizeNumber(patch.billedAmount)
    : normalizeNumber(current.billedAmount);
  const totalPaid = patch.totalPaid !== undefined
    ? normalizeNumber(patch.totalPaid)
    : normalizeNumber(current.totalPaid);

  await invoiceRef.update({
    ...patch,
    billedAmount,
    status: deriveStatus(totalPaid, billedAmount),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}
