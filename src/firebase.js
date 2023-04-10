// Import the functions you need from the SDKs you need
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const serviceAccount = require("./firebaseAdmin.json");
// Initialize Firebase
const app = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = getFirestore(app);
module.exports = db;