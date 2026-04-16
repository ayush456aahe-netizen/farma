const STORAGE_KEY = 'medinearby_medicines_v1';
const SHOWN_KEY = 'medinearby_shown_reminders';

const form = document.getElementById('medicineForm');
const medicineList = document.getElementById('medicineList');
const toast = document.getElementById('toast');
const medicineCount = document.getElementById('medicineCount');
const todayCount = document.getElementById('todayCount');
const activeCount = document.getElementById('activeCount');
const todayTimeline = document.getElementById('todayTimeline');
const nextReminder = document.getElementById('nextReminder');
const enableNotificationsBtn = document.getElementById('enableNotificationsBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const loadDemoBtn = document.getElementById('loadDemoBtn');
const searchInput = document.getElementById('searchInput');

let medicines = loadMedicines();
let shownReminderKeys = loadShownReminders();

function loadMedicines() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveMedicines() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(medicines));
}

function loadShownReminders() {
  try {
    return new Set(JSON.parse(localStorage.getItem(SHOWN_KEY)) || []);
  } catch {
    return new Set();
  }
}

function saveShownReminders() {
  localStorage.setItem(SHOWN_KEY, JSON.stringify([...shownReminderKeys]));
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add('hidden'), 2500);
}

async function requestNotifications() {
  if (!('Notification' in window)) {
    showToast('This browser does not support notifications.');
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    showToast('Notifications enabled.');
  } else {
    showToast('Notification permission denied.');
  }
}

enableNotificationsBtn.addEventListener('click', requestNotifications);

function generateId() {
  return `med-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseTimes(raw) {
  return raw
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .map(value => value.length === 4 ? `0${value}` : value)
    .filter(value => /^([01]\d|2[0-3]):([0-5]\d)$/.test(value));
}

function formatDate(dateStr) {
  if (!dateStr) return 'Not set';
  const date = new Date(dateStr);
  return Number.isNaN(date.getTime()) ? 'Not set' : date.toLocaleDateString();
}

function todayStrLocal() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function isDateActive(med) {
  const today = todayStrLocal();
  if (med.startDate && today < med.startDate) return false;
  if (med.endDate && today > med.endDate) return false;
  return true;
}

function getTodaySchedule() {
  const items = [];
  medicines.filter(isDateActive).forEach(med => {
    med.times.forEach(time => {
      items.push({
        id: med.id,
        time,
        name: med.name,
        dosage: med.dosage,
        foodInstruction: med.foodInstruction,
        notes: med.notes,
      });
    });
  });
  return items.sort((a, b) => a.time.localeCompare(b.time));
}

function getTakenHistory(med) {
  return med.takenHistory || [];
}

function renderTimeline() {
  const schedule = getTodaySchedule();
  todayCount.textContent = schedule.length;
  activeCount.textContent = medicines.filter(isDateActive).length;
  todayTimeline.innerHTML = '';

  if (!schedule.length) {
    nextReminder.textContent = 'No reminder yet';
    todayTimeline.innerHTML = `
      <div class="timeline-item">
        <div>
          <strong>No medicines for today</strong>
          <small>Add your first reminder from the form</small>
        </div>
      </div>`;
    document.title = 'MediNearby | Medicine Reminder';
    return;
  }

  const currentTime = new Date().toTimeString().slice(0, 5);
  const upcoming = schedule.find(item => item.time >= currentTime) || schedule[0];
  nextReminder.textContent = `${upcoming.time} • ${upcoming.name}`;
  document.title = `Next: ${upcoming.time} - ${upcoming.name}`;

  schedule.slice(0, 6).forEach(item => {
    const div = document.createElement('div');
    div.className = 'timeline-item';
    div.innerHTML = `
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <small>${escapeHtml(item.foodInstruction)}${item.dosage ? ` • ${escapeHtml(item.dosage)}` : ''}</small>
      </div>
      <strong>${item.time}</strong>
    `;
    todayTimeline.appendChild(div);
  });
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderMedicines() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = medicines.filter(med => {
    const full = `${med.name} ${med.dosage} ${med.foodInstruction} ${med.notes} ${(med.times || []).join(' ')}`.toLowerCase();
    return full.includes(query);
  });

  medicineCount.textContent = medicines.length;

  if (!filtered.length) {
    medicineList.innerHTML = '<div class="empty">No medicines found. Add a new medicine or change the search text.</div>';
    renderTimeline();
    return;
  }

  medicineList.innerHTML = filtered.map(med => {
    const history = getTakenHistory(med);
    const lastTaken = history.length ? history[history.length - 1] : null;

    return `
      <article class="medicine-card">
        <div class="medicine-top">
          <div>
            <h4 class="medicine-name">${escapeHtml(med.name)}</h4>
            <p class="meta">${escapeHtml(med.dosage || 'Dosage not set')} • ${escapeHtml(med.foodInstruction)}</p>
          </div>
          <div class="tag-wrap">${med.times.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>
        </div>

        <p class="meta">Start: ${formatDate(med.startDate)} • End: ${formatDate(med.endDate)}</p>
        <p class="notes">${escapeHtml(med.notes || 'No extra notes added.')}</p>
        <p class="history">Last taken: ${lastTaken ? escapeHtml(lastTaken) : 'Not marked yet'}</p>

        <div class="card-actions">
          <button class="btn btn-secondary btn-small" onclick="markTaken('${med.id}')">Mark Taken</button>
          <button class="btn btn-danger-soft btn-small" onclick="deleteMedicine('${med.id}')">Delete</button>
        </div>
      </article>
    `;
  }).join('');

  renderTimeline();
}

function addMedicine(payload) {
  medicines.unshift({
    id: generateId(),
    name: payload.name,
    dosage: payload.dosage,
    foodInstruction: payload.foodInstruction,
    notes: payload.notes,
    times: payload.times,
    startDate: payload.startDate,
    endDate: payload.endDate,
    takenHistory: []
  });
  saveMedicines();
  renderMedicines();
}

function deleteMedicine(id) {
  medicines = medicines.filter(med => med.id !== id);
  saveMedicines();
  showToast('Medicine deleted.');
  renderMedicines();
}
window.deleteMedicine = deleteMedicine;

function markTaken(id) {
  const med = medicines.find(item => item.id === id);
  if (!med) return;
  if (!Array.isArray(med.takenHistory)) med.takenHistory = [];

  const stamp = new Date().toLocaleString();
  med.takenHistory.push(stamp);
  if (med.takenHistory.length > 8) {
    med.takenHistory = med.takenHistory.slice(-8);
  }

  saveMedicines();
  showToast(`${med.name} marked as taken.`);
  renderMedicines();
}
window.markTaken = markTaken;

function sendReminder(med, time) {
  const title = `Time to take ${med.name}`;
  const body = `${med.dosage || 'Medicine dose'} • ${med.foodInstruction}`;
  showToast(`${title} - ${time}`);

  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body });
  }
}

function clearExpiredReminderKeys() {
  const today = todayStrLocal();
  const filtered = [...shownReminderKeys].filter(key => key.includes(`-${today}-`));
  shownReminderKeys = new Set(filtered);
  saveShownReminders();
}

function checkReminders() {
  clearExpiredReminderKeys();
  const currentTime = new Date().toTimeString().slice(0, 5);
  const today = todayStrLocal();

  medicines.filter(isDateActive).forEach(med => {
    med.times.forEach(time => {
      const reminderKey = `${med.id}-${today}-${time}`;
      if (time === currentTime && !shownReminderKeys.has(reminderKey)) {
        shownReminderKeys.add(reminderKey);
        saveShownReminders();
        sendReminder(med, time);
      }
    });
  });
}

function loadDemoData() {
  if (medicines.length) {
    showToast('Clear current medicines first to load demo data.');
    return;
  }

  const today = todayStrLocal();
  medicines = [
    {
      id: generateId(),
      name: 'Vitamin C',
      dosage: '1 tablet',
      foodInstruction: 'After food',
      notes: 'Take after breakfast with water.',
      times: ['08:00'],
      startDate: today,
      endDate: '',
      takenHistory: []
    },
    {
      id: generateId(),
      name: 'Paracetamol',
      dosage: '1 tablet',
      foodInstruction: 'After food',
      notes: 'Use only when fever or body pain is present.',
      times: ['14:00', '21:00'],
      startDate: today,
      endDate: '',
      takenHistory: []
    }
  ];

  saveMedicines();
  showToast('Demo medicines loaded.');
  renderMedicines();
}

form.addEventListener('submit', event => {
  event.preventDefault();

  const payload = {
    name: document.getElementById('name').value.trim(),
    dosage: document.getElementById('dosage').value.trim(),
    foodInstruction: document.getElementById('foodInstruction').value,
    notes: document.getElementById('notes').value.trim(),
    times: parseTimes(document.getElementById('times').value),
    startDate: document.getElementById('startDate').value,
    endDate: document.getElementById('endDate').value
  };

  if (!payload.name) {
    showToast('Please enter medicine name.');
    return;
  }

  if (!payload.times.length) {
    showToast('Please enter valid time like 08:00, 14:00');
    return;
  }

  if (payload.startDate && payload.endDate && payload.startDate > payload.endDate) {
    showToast('End date must be after start date.');
    return;
  }

  addMedicine(payload);
  form.reset();
  document.getElementById('foodInstruction').value = 'After food';
  showToast('Medicine reminder saved.');
});

searchInput.addEventListener('input', renderMedicines);
loadDemoBtn.addEventListener('click', loadDemoData);
clearAllBtn.addEventListener('click', () => {
  if (!medicines.length) {
    showToast('No medicines to clear.');
    return;
  }
  if (!confirm('Delete all medicine reminders?')) return;
  medicines = [];
  shownReminderKeys = new Set();
  saveMedicines();
  saveShownReminders();
  showToast('All medicines cleared.');
  renderMedicines();
});

renderMedicines();
checkReminders();
setInterval(checkReminders, 15000);
setInterval(renderTimeline, 30000);
