/**
 * ===================================================================
 *  App Module - Quản lý thiết bị & Điều khiển Relay
 *  Lắng nghe realtime từ Firebase Realtime Database
 * ===================================================================
 */

// ===== DOM ELEMENTS =====
const devicesGrid = document.getElementById('devices-grid');
const emptyState = document.getElementById('empty-state');
const statTotal = document.getElementById('stat-total');
const statOnline = document.getElementById('stat-online');
const statActive = document.getElementById('stat-active');

// Add Device Modal
const addDeviceModal = document.getElementById('add-device-modal');
const addDeviceForm = document.getElementById('add-device-form');
const deviceChipIdInput = document.getElementById('device-chip-id');
const deviceNameInput = document.getElementById('device-name');
const addDeviceError = document.getElementById('add-device-error');
const btnAddDevice = document.getElementById('btn-add-device');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCancelAdd = document.getElementById('btn-cancel-add');
const btnConfirmAdd = document.getElementById('btn-confirm-add');
const addBtnText = document.getElementById('add-btn-text');

// Delete Device Modal
const deleteDeviceModal = document.getElementById('delete-device-modal');
const deleteDeviceName = document.getElementById('delete-device-name');
const btnConfirmDelete = document.getElementById('btn-confirm-delete');

// ===== STATE =====
let currentUser = null;
let devicesRef = null;
let userDevicesRef = null;
let deviceListeners = {};
let localDevices = {};
let deleteTargetChipId = null;

// Ngưỡng xác định offline (ms) - 60 giây không có heartbeat = offline
const OFFLINE_THRESHOLD_MS = 60000;

// ===== KHỞI TẠO APP (Gọi từ auth.js) =====
function initApp(user) {
  currentUser = user;
  localDevices = {};
  deviceListeners = {};

  // Lắng nghe danh sách thiết bị của user
  userDevicesRef = db.ref('user_devices/' + user.uid);
  userDevicesRef.on('value', onUserDevicesChanged);

  console.log('[App] Đã khởi tạo cho user:', user.email);
}

// ===== CLEANUP (Gọi từ auth.js khi logout) =====
function cleanupApp() {
  // Gỡ tất cả listener
  if (userDevicesRef) {
    userDevicesRef.off();
  }

  Object.keys(deviceListeners).forEach((chipId) => {
    if (deviceListeners[chipId]) {
      deviceListeners[chipId].off();
    }
  });

  deviceListeners = {};
  localDevices = {};
  currentUser = null;
  devicesGrid.innerHTML = '';
  updateStats();

  console.log('[App] Đã cleanup.');
}

// ===== LISTENER: DANH SÁCH THIẾT BỊ CỦA USER =====
function onUserDevicesChanged(snapshot) {
  const userDeviceIds = snapshot.val() || {};
  const newChipIds = Object.keys(userDeviceIds);

  // Tìm thiết bị đã bị xóa
  const currentChipIds = Object.keys(localDevices);
  currentChipIds.forEach((chipId) => {
    if (!newChipIds.includes(chipId)) {
      // Thiết bị đã bị xóa → gỡ listener và card
      if (deviceListeners[chipId]) {
        deviceListeners[chipId].off();
        delete deviceListeners[chipId];
      }
      delete localDevices[chipId];
      removeDeviceCard(chipId);
    }
  });

  // Thêm listener cho thiết bị mới
  newChipIds.forEach((chipId) => {
    if (!deviceListeners[chipId]) {
      const ref = db.ref('devices/' + chipId);
      deviceListeners[chipId] = ref;
      ref.on('value', (deviceSnap) => {
        onDeviceDataChanged(chipId, deviceSnap);
      });
    }
  });

  // Hiển thị empty state nếu không có thiết bị
  if (newChipIds.length === 0) {
    devicesGrid.innerHTML = '';
    emptyState.style.display = 'block';
  } else {
    emptyState.style.display = 'none';
  }

  updateStats();
}

// ===== LISTENER: DỮ LIỆU MỘT THIẾT BỊ THAY ĐỔI =====
function onDeviceDataChanged(chipId, snapshot) {
  const data = snapshot.val();
  if (!data) return;

  localDevices[chipId] = data;

  // Xác định online/offline dựa vào lastSeen
  const isOnline = isDeviceOnline(data);

  // Tạo hoặc cập nhật card
  let card = document.getElementById('device-' + chipId);
  if (!card) {
    card = createDeviceCard(chipId, data, isOnline);
    devicesGrid.appendChild(card);
  } else {
    updateDeviceCard(chipId, data, isOnline);
  }

  updateStats();
}

// ===== XÁC ĐỊNH THIẾT BỊ ONLINE/OFFLINE =====
function isDeviceOnline(deviceData) {
  if (!deviceData.online) return false;
  // Nếu lastSeen là giá trị millis() từ ESP, ta không so sánh chính xác được
  // Thay vào đó dựa vào field online mà ESP cập nhật
  return deviceData.online === true;
}

// ===== TẠO DEVICE CARD =====
function createDeviceCard(chipId, data, isOnline) {
  const card = document.createElement('div');
  card.id = 'device-' + chipId;
  card.className = 'device-card' + (data.state ? ' active' : '');

  card.innerHTML = `
    <div class="device-card-top">
      <div class="device-info">
        <div class="device-name" title="${escapeHtml(data.name || 'Không tên')}">${escapeHtml(data.name || 'Không tên')}</div>
        <div class="device-chip-id">ID: ${chipId}</div>
      </div>
      <div class="device-status ${isOnline ? 'online' : 'offline'}">
        <span class="status-dot"></span>
        <span class="status-text">${isOnline ? 'Online' : 'Offline'}</span>
      </div>
    </div>
    <div class="device-card-bottom">
      <div class="device-meta">
        ${data.ip ? 'IP: ' + data.ip : ''}
        ${data.rssi ? ' • ' + data.rssi + 'dBm' : ''}
      </div>
      <div class="device-actions">
        <button class="btn-icon device-delete-btn" onclick="showDeleteModal('${chipId}')" title="Xóa thiết bị">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6"/>
            <path d="M14 11v6"/>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
        </button>
        <label class="toggle-switch">
          <input type="checkbox" 
                 ${data.state ? 'checked' : ''} 
                 onchange="toggleDevice('${chipId}', this.checked)"
                 id="toggle-${chipId}">
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>
  `;

  return card;
}

// ===== CẬP NHẬT DEVICE CARD =====
function updateDeviceCard(chipId, data, isOnline) {
  const card = document.getElementById('device-' + chipId);
  if (!card) return;

  // Cập nhật class active
  if (data.state) {
    card.classList.add('active');
  } else {
    card.classList.remove('active');
  }

  // Cập nhật tên
  const nameEl = card.querySelector('.device-name');
  if (nameEl) nameEl.textContent = data.name || 'Không tên';

  // Cập nhật status
  const statusEl = card.querySelector('.device-status');
  if (statusEl) {
    statusEl.className = 'device-status ' + (isOnline ? 'online' : 'offline');
    const statusText = statusEl.querySelector('.status-text');
    if (statusText) statusText.textContent = isOnline ? 'Online' : 'Offline';
  }

  // Cập nhật toggle (chỉ khi khác trạng thái hiện tại để tránh vòng lặp)
  const toggle = document.getElementById('toggle-' + chipId);
  if (toggle && toggle.checked !== data.state) {
    toggle.checked = data.state;
  }

  // Cập nhật meta info
  const metaEl = card.querySelector('.device-meta');
  if (metaEl) {
    let meta = '';
    if (data.ip) meta += 'IP: ' + data.ip;
    if (data.rssi) meta += (meta ? ' • ' : '') + data.rssi + 'dBm';
    metaEl.textContent = meta;
  }
}

// ===== XÓA DEVICE CARD =====
function removeDeviceCard(chipId) {
  const card = document.getElementById('device-' + chipId);
  if (card) {
    card.style.animation = 'fadeIn 0.3s ease reverse forwards';
    setTimeout(() => card.remove(), 300);
  }
}

// ===== BẬT/TẮT THIẾT BỊ =====
function toggleDevice(chipId, newState) {
  db.ref('devices/' + chipId + '/state')
    .set(newState)
    .then(() => {
      showToast(
        (localDevices[chipId]?.name || chipId) + ': ' + (newState ? 'BẬT ⚡' : 'TẮT'),
        'success'
      );
    })
    .catch((err) => {
      showToast('Lỗi: ' + err.message, 'error');
      // Revert toggle
      const toggle = document.getElementById('toggle-' + chipId);
      if (toggle) toggle.checked = !newState;
    });
}

// ===== CẬP NHẬT THỐNG KÊ =====
function updateStats() {
  const devices = Object.values(localDevices);
  const total = devices.length;
  const online = devices.filter((d) => d.online === true).length;
  const active = devices.filter((d) => d.state === true).length;

  statTotal.textContent = total;
  statOnline.textContent = online;
  statActive.textContent = active;
}

// ===== MODAL: THÊM THIẾT BỊ =====
btnAddDevice.addEventListener('click', () => {
  addDeviceModal.style.display = 'flex';
  addDeviceError.style.display = 'none';
  addDeviceForm.reset();
  deviceChipIdInput.focus();
});

btnCloseModal.addEventListener('click', closeAddModal);
btnCancelAdd.addEventListener('click', closeAddModal);

addDeviceModal.addEventListener('click', (e) => {
  if (e.target === addDeviceModal) closeAddModal();
});

function closeAddModal() {
  addDeviceModal.style.display = 'none';
}

addDeviceForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const chipId = deviceChipIdInput.value.trim().toUpperCase();
  const name = deviceNameInput.value.trim();

  if (!chipId || !name) return;

  setAddDeviceLoading(true);
  addDeviceError.style.display = 'none';

  try {
    // Kiểm tra thiết bị đã tồn tại trên Firebase chưa
    const deviceSnap = await db.ref('devices/' + chipId).once('value');

    if (!deviceSnap.exists()) {
      // Thiết bị chưa được ESP đăng ký → tạo entry mới (ESP sẽ update khi online)
      await db.ref('devices/' + chipId).set({
        chipId: chipId,
        name: name,
        state: false,
        online: false,
        owner: currentUser.uid,
        type: 'relay',
        pin: 0
      });
    } else {
      // Thiết bị đã được ESP đăng ký → kiểm tra owner
      const deviceData = deviceSnap.val();
      if (deviceData.owner && deviceData.owner !== currentUser.uid) {
        throw new Error('Thiết bị này đã thuộc về tài khoản khác.');
      }
      // Cập nhật owner và tên
      await db.ref('devices/' + chipId).update({
        owner: currentUser.uid,
        name: name
      });
    }

    // Thêm vào danh sách thiết bị của user
    await db.ref('user_devices/' + currentUser.uid + '/' + chipId).set(true);

    showToast('Đã thêm thiết bị: ' + name + ' 🎉', 'success');
    closeAddModal();
  } catch (error) {
    addDeviceError.textContent = error.message;
    addDeviceError.style.display = 'block';
  } finally {
    setAddDeviceLoading(false);
  }
});

function setAddDeviceLoading(loading) {
  btnConfirmAdd.disabled = loading;
  addBtnText.style.display = loading ? 'none' : 'inline';
  btnConfirmAdd.querySelector('.btn-spinner').style.display = loading ? 'block' : 'none';
}

// ===== MODAL: XÓA THIẾT BỊ =====
function showDeleteModal(chipId) {
  deleteTargetChipId = chipId;
  const deviceData = localDevices[chipId];
  deleteDeviceName.textContent = deviceData?.name || chipId;
  deleteDeviceModal.style.display = 'flex';
}

// Đóng modal xóa
document.querySelectorAll('.btn-close-delete-modal').forEach((btn) => {
  btn.addEventListener('click', () => {
    deleteDeviceModal.style.display = 'none';
    deleteTargetChipId = null;
  });
});

deleteDeviceModal.addEventListener('click', (e) => {
  if (e.target === deleteDeviceModal) {
    deleteDeviceModal.style.display = 'none';
    deleteTargetChipId = null;
  }
});

btnConfirmDelete.addEventListener('click', async () => {
  if (!deleteTargetChipId || !currentUser) return;

  const chipId = deleteTargetChipId;
  const deviceName = localDevices[chipId]?.name || chipId;

  try {
    // Xóa khỏi danh sách user
    await db.ref('user_devices/' + currentUser.uid + '/' + chipId).remove();

    // Xóa dữ liệu thiết bị (tùy chọn - có thể giữ lại để ESP vẫn hoạt động)
    await db.ref('devices/' + chipId).remove();

    showToast('Đã xóa thiết bị: ' + deviceName, 'info');
  } catch (error) {
    showToast('Lỗi xóa: ' + error.message, 'error');
  }

  deleteDeviceModal.style.display = 'none';
  deleteTargetChipId = null;
});

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (addDeviceModal.style.display !== 'none') closeAddModal();
    if (deleteDeviceModal.style.display !== 'none') {
      deleteDeviceModal.style.display = 'none';
      deleteTargetChipId = null;
    }
  }
});

// ===== HELPERS =====
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
