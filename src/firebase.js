import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC-f_1gVfaiYQeblI3-a2zD7yQaJCbgaQ4",
  authDomain: "taller-os-a5688.firebaseapp.com",
  projectId: "taller-os-a5688",
  storageBucket: "taller-os-a5688.firebasestorage.app",
  messagingSenderId: "452950643983",
  appId: "1:452950643983:web:1d0e4d543af03dc4ff1a7a"
};

const app = initializeApp(firebaseConfig);
export const db  = getFirestore(app);
