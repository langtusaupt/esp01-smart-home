/**
 * ===================================================================
 *  Authentication Module
 *  Xử lý đăng ký, đăng nhập, đăng xuất bằng Firebase Auth
 * ===================================================================
 */

// ===== DOM ELEMENTS =====
const authSection = document.getElementById('auth-section');
const appSection = document.getElementById('app-section');
const loadingOverlay = document.getElementById('loading-overlay');

const authForm = document.getElementById('auth-form');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const authName = document.getElementById('auth-name');
const nameField = document.getElementById('name-field');
const authError = document.getElementById('auth-error');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authBtnText = document.getElementById('auth-btn-text');
const authSubtitle = document.getElementById('auth-subtitle');
const authSwitchText = document.getElementById('auth-switch-text');
const authSwitchBtn = document.getElementById('auth-switch-btn');
const togglePasswordBtn = document.getElementById('toggle-password');

const btnLogout = document.getElementById('btn-logout');
const userEmailDisplay = document.getElementById('user-email-display');

// ===== STATE =====
let isRegisterMode = false;

// ===== AUTH STATE OBSERVER =====
auth.onAuthStateChanged((user) => {
  // Ẩn loading
  setTimeout(() => {
    loadingOverlay.classList.add('fade-out');
    setTimeout(() => {
      loadingOverlay.style.display = 'none';
    }, 400);
  }, 300);

  if (user) {
    // Đã đăng nhập
    authSection.style.display = 'none';
    appSection.style.display = 'block';
    userEmailDisplay.textContent = user.email;

    // Lưu thông tin user vào database
    db.ref('users/' + user.uid).update({
      email: user.email,
      displayName: user.displayName || '',
      lastLogin: firebase.database.ServerValue.TIMESTAMP
    });

    // Khởi tạo app (gọi từ app.js)
    if (typeof initApp === 'function') {
      initApp(user);
    }
  } else {
    // Chưa đăng nhập
    authSection.style.display = 'flex';
    appSection.style.display = 'none';
  }
});

// ===== CHUYỂN GIỮA ĐĂNG NHẬP / ĐĂNG KÝ =====
authSwitchBtn.addEventListener('click', () => {
  isRegisterMode = !isRegisterMode;
  authError.style.display = 'none';
  authEmail.value = '';
  authPassword.value = '';
  authName.value = '';

  if (isRegisterMode) {
    nameField.style.display = 'block';
    authBtnText.textContent = 'Đăng ký';
    authSubtitle.textContent = 'Tạo tài khoản để bắt đầu';
    authSwitchText.textContent = 'Đã có tài khoản?';
    authSwitchBtn.textContent = 'Đăng nhập';
  } else {
    nameField.style.display = 'none';
    authBtnText.textContent = 'Đăng nhập';
    authSubtitle.textContent = 'Đăng nhập để điều khiển thiết bị';
    authSwitchText.textContent = 'Chưa có tài khoản?';
    authSwitchBtn.textContent = 'Đăng ký';
  }
});

// ===== GỬI FORM =====
authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = authEmail.value.trim();
  const password = authPassword.value;
  const name = authName.value.trim();

  if (!email || !password) return;

  // Disable button, show spinner
  setAuthLoading(true);
  authError.style.display = 'none';

  try {
    if (isRegisterMode) {
      // Đăng ký
      const userCredential = await auth.createUserWithEmailAndPassword(email, password);

      // Cập nhật display name
      if (name) {
        await userCredential.user.updateProfile({ displayName: name });
      }

      // Lưu thông tin user
      await db.ref('users/' + userCredential.user.uid).set({
        email: email,
        displayName: name,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        lastLogin: firebase.database.ServerValue.TIMESTAMP
      });

      showToast('Đăng ký thành công! 🎉', 'success');
    } else {
      // Đăng nhập
      await auth.signInWithEmailAndPassword(email, password);
      showToast('Đăng nhập thành công!', 'success');
    }
  } catch (error) {
    let message;
    switch (error.code) {
      case 'auth/email-already-in-use':
        message = 'Email này đã được sử dụng.';
        break;
      case 'auth/invalid-email':
        message = 'Email không hợp lệ.';
        break;
      case 'auth/weak-password':
        message = 'Mật khẩu phải có ít nhất 6 ký tự.';
        break;
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        message = 'Email hoặc mật khẩu không đúng.';
        break;
      case 'auth/too-many-requests':
        message = 'Quá nhiều lần thử. Vui lòng đợi và thử lại sau.';
        break;
      default:
        message = 'Lỗi: ' + error.message;
    }
    authError.textContent = message;
    authError.style.display = 'block';
  } finally {
    setAuthLoading(false);
  }
});

// ===== ĐĂNG XUẤT =====
btnLogout.addEventListener('click', async () => {
  try {
    // Cleanup app listeners (gọi từ app.js)
    if (typeof cleanupApp === 'function') {
      cleanupApp();
    }
    await auth.signOut();
    showToast('Đã đăng xuất.', 'info');
  } catch (error) {
    showToast('Lỗi đăng xuất: ' + error.message, 'error');
  }
});

// ===== TOGGLE PASSWORD VISIBILITY =====
togglePasswordBtn.addEventListener('click', () => {
  const type = authPassword.type === 'password' ? 'text' : 'password';
  authPassword.type = type;
});

// ===== HELPERS =====
function setAuthLoading(loading) {
  authSubmitBtn.disabled = loading;
  authBtnText.style.display = loading ? 'none' : 'inline';
  authSubmitBtn.querySelector('.btn-spinner').style.display = loading ? 'block' : 'none';
}

/**
 * Hiện toast notification
 * @param {string} message - Nội dung thông báo
 * @param {'success'|'error'|'info'} type - Loại thông báo
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  // Tự động ẩn sau 3 giây
  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 250);
  }, 3000);
}
