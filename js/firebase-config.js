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
  apiKey: "AIzaSyCvveBbz-V3OGF6lZ8etlHQw_ydfu6J9eY",
  authDomain: "esp01-smarthome.firebaseapp.com",
  databaseURL: "https://esp01-smarthome-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "esp01-smarthome",
  storageBucket: "esp01-smarthome.firebasestorage.app",
  messagingSenderId: "49237615529",
  appId: "1:49237615529:web:83a851940b18f97ed04db8"
};

// Khởi tạo Firebase
firebase.initializeApp(firebaseConfig);

// Export các service
const auth = firebase.auth();
const db = firebase.database();

console.log('[Firebase] Đã khởi tạo thành công.');
