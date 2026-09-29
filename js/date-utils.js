function normalizeDateInput(value) {
  if (value == null) return "";
  if (typeof value === "object" && typeof value.toDate === "function") {
    const d = value.toDate();
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  }

  const v = String(value).trim().replace(/\uFEFF/g, "");
  if (!v) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;

  if (/^\d{8}$/.test(v)) {
    return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  }

  if (/^\d{4,5}(\.\d+)?$/.test(v)) {
    const serial = Number(v);
    if (serial > 30000 && serial < 60000) {
      const utc = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      if (!Number.isNaN(utc.getTime())) {
        return utc.toISOString().slice(0, 10);
      }
    }
  }

  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(v)) {
    const [y, m, d] = v.split("/");
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v)) {
    const [m, d, y] = v.split("/");
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(v)) {
    const [m, d, y] = v.split("-");
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  const jp = v.match(/^(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  if (jp) {
    return `${jp[1]}-${String(jp[2]).padStart(2, "0")}-${String(jp[3]).padStart(2, "0")}`;
  }

  const slashNormalized = v.replace(/\//g, "-");
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(slashNormalized)) {
    const [y, m, d] = slashNormalized.split("-");
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  const parsed = new Date(v);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  return "";
}

function parseFlexibleDate(value, yearHint) {
  const normalized = normalizeDateInput(value);
  if (normalized) return normalized;

  const v = String(value ?? "").trim().replace(/\uFEFF/g, "");
  if (!v) return "";

  const year = Number(yearHint);
  const y = Number.isFinite(year) && year >= 2000 ? year : new Date().getFullYear();

  const mdJa = v.match(/^(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (mdJa) {
    return `${y}-${String(mdJa[1]).padStart(2, "0")}-${String(mdJa[2]).padStart(2, "0")}`;
  }

  const md = v.match(/^(\d{1,2})[\/.\-](\d{1,2})$/);
  if (md) {
    return `${y}-${String(md[1]).padStart(2, "0")}-${String(md[2]).padStart(2, "0")}`;
  }

  return "";
}

function parseDateOnly(value) {
  const iso = normalizeDateInput(value);
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatDateJa(value) {
  const iso = normalizeDateInput(value);
  if (!iso) {
    const raw = String(value || "").trim();
    return raw || "-";
  }
  const date = parseDateOnly(iso);
  if (!date) return String(value || "").trim() || "-";
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日(${weekdays[date.getDay()]})`;
}
