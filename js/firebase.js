const firebaseConfig = {
  apiKey: "AIzaSyDwCSI2kDqV7eMPqwBh0nNDORdGtw5aydQ",
  authDomain: "kdaikda.firebaseapp.com",
  projectId: "kdaikda",
  storageBucket: "kdaikda.firebasestorage.app",
  messagingSenderId: "640889239505",
  appId: "1:640889239505:web:993aa3aba77560837f12f0",
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();
