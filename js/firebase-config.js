/**
 * ===================================================================
 *  Firebase Configuration
 * ===================================================================
 *  HƯỚNG DẪN:
 *  1. Truy cập https://console.firebase.google.com/
 *  2. Tạo project mới (hoặc mở project đã có)
 *  3. Vào Project Settings (⚙️) → Your apps → Nhấn "</>" (Web)
 *  4. Copy giá trị firebaseConfig và dán vào bên dưới
 * ===================================================================
 */

// ⚠️ THAY CÁC GIÁ TRỊ BÊN DƯỚI BẰNG THÔNG TIN FIREBASE CỦA BẠN
const firebaseConfig = {
  apiKey: "YOUR_API_KEY_HERE",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Khởi tạo Firebase
firebase.initializeApp(firebaseConfig);

// Export các service
const auth = firebase.auth();
const db = firebase.database();

console.log('[Firebase] Đã khởi tạo thành công.');
