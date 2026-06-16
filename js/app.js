/**
 * ===================================================================
 *  App Module — Quản lý thiết bị & Điều khiển Relay
 * ===================================================================
 *  CẢI TIẾN CHÍNH:
 *  - Phát hiện offline bằng Firebase Server Timestamp
 *  - Auto-refresh timer mỗi 15 giây
 *  - Hiển thị chi tiết: uptime, RSSI icon, thời gian cập nhật cuối
 *  - Disable toggle khi thiết bị offline
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
let statusRefreshTimer = null;

// Ngưỡng xác định offline — 60 giây không có heartbeat = offline
const OFFLINE_THRESHOLD_MS = 60000;
// Tần suất kiểm tra lại trạng thái online/offline
const STATUS_REFRESH_INTERVAL = 15000;

// ===== KHỞI TẠO APP (Gọi từ auth.js) =====
function initApp(user) {
  currentUser = user;
  localDevices = {};
  deviceListeners = {};

  // Lắng nghe danh sách thiết bị của user
  userDevicesRef = db.ref('user_devices/' + user.uid);
  userDevicesRef.on('value', onUserDevicesChanged);

  // Bắt đầu timer kiểm tra trạng thái định kỳ
  startStatusRefreshTimer();

  console.log('[App] Đã khởi tạo cho user:', user.email);
}

// ===== CLEANUP (Gọi từ auth.js khi logout) =====
function cleanupApp() {
  // Dừng timer
  stopStatusRefreshTimer();

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

// ===== TIMER KIỂM TRA TRẠNG THÁI =====
// Quan trọng: Firebase realtime chỉ fire khi DỮ LIỆU thay đổi.
// Khi ESP offline, KHÔNG CÓ thay đổi nào → web không biết.
// Timer này kiểm tra lại mỗi 15 giây để phát hiện thiết bị offline.

function startStatusRefreshTimer() {
  stopStatusRefreshTimer();
  statusRefreshTimer = setInterval(() => {
    refreshAllDeviceStatus();
  }, STATUS_REFRESH_INTERVAL);
}

function stopStatusRefreshTimer() {
  if (statusRefreshTimer) {
    clearInterval(statusRefreshTimer);
    statusRefreshTimer = null;
  }
}

function refreshAllDeviceStatus() {
  Object.keys(localDevices).forEach((chipId) => {
    const data = localDevices[chipId];
    const isOnline = isDeviceOnline(data);
    updateDeviceCard(chipId, data, isOnline);
  });
  updateStats();
}

// ===== LISTENER: DANH SÁCH THIẾT BỊ CỦA USER =====
function onUserDevicesChanged(snapshot) {
  const userDeviceIds = snapshot.val() || {};
  const newChipIds = Object.keys(userDeviceIds);

  // Tìm thiết bị đã bị xóa
  const currentChipIds = Object.keys(localDevices);
  currentChipIds.forEach((chipId) => {
    if (!newChipIds.includes(chipId)) {
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

  const isOnline = isDeviceOnline(data);

  let card = document.getElementById('device-' + chipId);
  if (!card) {
    card = createDeviceCard(chipId, data, isOnline);
    devicesGrid.appendChild(card);
  } else {
    updateDeviceCard(chipId, data, isOnline);
  }

  updateStats();
}

// ===== XÁC ĐỊNH THIẾT BỊ ONLINE/OFFLINE (CẢI TIẾN) =====
// Dùng Firebase Server Timestamp thay vì tin tưởng field "online"
function isDeviceOnline(deviceData) {
  if (!deviceData.lastSeen || typeof deviceData.lastSeen !== 'number') {
    return false;
  }
  const now = Date.now();
  const elapsed = now - deviceData.lastSeen;
  return elapsed < OFFLINE_THRESHOLD_MS;
}

// ===== HELPER: TÍNH THỜI GIAN TƯƠNG ĐỐI =====
function timeAgo(timestamp) {
  if (!timestamp || typeof timestamp !== 'number') return 'Chưa xác định';
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 10000) return 'Vừa xong';
  if (diff < 60000) return Math.floor(diff / 1000) + ' giây trước';
  if (diff < 3600000) return Math.floor(diff / 60000) + ' phút trước';
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' giờ trước';
  
  // Hiển thị ngày giờ cụ thể nếu > 24h
  const date = new Date(timestamp);
  return date.toLocaleString('vi-VN', { 
    hour: '2-digit', minute: '2-digit',
    day: '2-digit', month: '2-digit' 
  });
}

// ===== HELPER: ĐỊNH DẠNG UPTIME =====
function formatUptime(seconds) {
  if (!seconds || seconds < 0) return '';
  if (seconds < 60) return seconds + 'giây';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'p ' + (seconds % 60) + 'giây';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return hours + 'h ' + mins + 'p';
}

// ===== HELPER: ICON CƯỜNG ĐỘ WIFI =====
function rssiIcon(rssi) {
  if (!rssi) return '';
  if (rssi >= -50) return '📶'; // Mạnh
  if (rssi >= -70) return '📶'; // Trung bình
  return '📡';                   // Yếu
}

function rssiLabel(rssi) {
  if (!rssi) return '';
  if (rssi >= -50) return 'Mạnh';
  if (rssi >= -70) return 'Trung bình';
  return 'Yếu';
}

// ===== TẠO DEVICE CARD =====
function createDeviceCard(chipId, data, isOnline) {
  const card = document.createElement('div');
  card.id = 'device-' + chipId;
  card.className = 'device-card' + (data.state ? ' active' : '') + (!isOnline ? ' offline-card' : '');

  card.innerHTML = buildCardHTML(chipId, data, isOnline);
  return card;
}

function buildCardHTML(chipId, data, isOnline) {
  const statusClass = isOnline ? 'online' : 'offline';
  const statusText = isOnline ? 'Trực tuyến' : 'Mất kết nối';
  const toggleDisabled = !isOnline ? 'disabled' : '';

  // Thông tin chi tiết khi online
  let detailHtml = '';
  if (isOnline) {
    const parts = [];
    if (data.rssi) parts.push(rssiIcon(data.rssi) + ' ' + rssiLabel(data.rssi) + ' (' + data.rssi + 'dBm)');
    if (data.ip) parts.push('IP: ' + data.ip);
    detailHtml = '<div class="device-detail">' + parts.join(' • ') + '</div>';

    if (data.uptime) {
      detailHtml += '<div class="device-detail">⏱ Hoạt động: ' + formatUptime(data.uptime) + '</div>';
    }
    detailHtml += '<div class="device-detail device-detail-muted">🕐 Cập nhật: ' + timeAgo(data.lastSeen) + '</div>';
  } else {
    // Thông tin khi offline
    detailHtml = '<div class="device-detail device-detail-warning">⚠️ ' + timeAgo(data.lastSeen) + '</div>';
    if (data.lastSeen) {
      const date = new Date(data.lastSeen);
      detailHtml += '<div class="device-detail device-detail-muted">🕐 Lần cuối: ' + 
        date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) + 
        '</div>';
    }
  }

  return `
    <div class="device-card-top">
      <div class="device-info">
        <div class="device-name" title="${escapeHtml(data.name || 'Không tên')}">${escapeHtml(data.name || 'Không tên')}</div>
        <div class="device-chip-id">ID: ${chipId}</div>
      </div>
      <div class="device-status ${statusClass}">
        <span class="status-dot"></span>
        <span class="status-text">${statusText}</span>
      </div>
    </div>
    <div class="device-details-section">
      ${detailHtml}
    </div>
    <div class="device-card-bottom">
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
                 ${toggleDisabled}
                 onchange="toggleDevice('${chipId}', this.checked)"
                 id="toggle-${chipId}">
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>
  `;
}

// ===== CẬP NHẬT DEVICE CARD =====
function updateDeviceCard(chipId, data, isOnline) {
  const card = document.getElementById('device-' + chipId);
  if (!card) return;

  // Cập nhật class
  card.className = 'device-card' + (data.state ? ' active' : '') + (!isOnline ? ' offline-card' : '');

  // Rebuild nội dung card
  card.innerHTML = buildCardHTML(chipId, data, isOnline);
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
  // Không cho phép toggle khi offline
  const data = localDevices[chipId];
  if (data && !isDeviceOnline(data)) {
    showToast('Thiết bị đang mất kết nối. Không thể điều khiển.', 'error');
    const toggle = document.getElementById('toggle-' + chipId);
    if (toggle) toggle.checked = !newState;
    return;
  }

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
      const toggle = document.getElementById('toggle-' + chipId);
      if (toggle) toggle.checked = !newState;
    });
}

// ===== CẬP NHẬT THỐNG KÊ =====
function updateStats() {
  const devices = Object.values(localDevices);
  const total = devices.length;
  const online = devices.filter((d) => isDeviceOnline(d)).length;
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
    const deviceSnap = await db.ref('devices/' + chipId).once('value');

    if (!deviceSnap.exists()) {
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
      const deviceData = deviceSnap.val();
      if (deviceData.owner && deviceData.owner !== currentUser.uid) {
        throw new Error('Thiết bị này đã thuộc về tài khoản khác.');
      }
      await db.ref('devices/' + chipId).update({
        owner: currentUser.uid,
        name: name
      });
    }

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
    await db.ref('user_devices/' + currentUser.uid + '/' + chipId).remove();
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
