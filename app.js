import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, doc, setDoc, getDoc, getDocs,
  onSnapshot, deleteDoc, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Firebase init ─────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAWkk36yNJeKZnwnGMm14dacwUMncCKp6g",
  authDomain: "dr-ben-s-attendance.firebaseapp.com",
  projectId: "dr-ben-s-attendance",
  storageBucket: "dr-ben-s-attendance.firebasestorage.app",
  messagingSenderId: "516436208651",
  appId: "1:516436208651:web:32ce7b084885eb76bc2b0e"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ── Collections ───────────────────────────────────────────────────
const studentsCol = collection(db, "students");
const sessionsCol = collection(db, "sessions");
const recordsCol  = collection(db, "records");
const settingsDoc = doc(db, "settings", "app");

// ── Local state (mirrored from Firestore) ─────────────────────────
let students  = [];
let sessions  = [];
let records   = [];
let teacherPin = "1234";
let countdownTimer = null;
let unsubSessions = null;
let unsubRecords  = null;

// ── Helpers ───────────────────────────────────────────────────────
const today   = () => new Date().toISOString().slice(0, 10);
const fmtTime = (d) => new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const uid     = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const classes = () => [...new Set(students.map(s => s.cls))].sort();

// ── Background photo slideshow ───────────────────────────────────
function startSlideshow() {
  const slides = document.querySelectorAll('.bg-slide');
  if (!slides.length) return;
  let current = 0;
  setInterval(() => {
    slides[current].classList.remove('active');
    current = (current + 1) % slides.length;
    slides[current].classList.add('active');
  }, 5000); // change photo every 5 seconds
}

// ── Particle generator ───────────────────────────────────────────
function createParticles() {
  const container = document.getElementById('particles');
  if (!container) return;
  const count = 18;
  const sizes  = [4, 6, 8, 10, 5, 7];
  const colors = ['rgba(255,255,255,0.2)','rgba(100,180,255,0.25)','rgba(255,200,100,0.15)','rgba(100,255,150,0.15)'];
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = sizes[Math.floor(Math.random() * sizes.length)];
    p.style.cssText = `
      width:${size}px; height:${size}px;
      left:${Math.random()*100}%;
      background:${colors[Math.floor(Math.random()*colors.length)]};
      animation-duration:${8 + Math.random()*14}s;
      animation-delay:-${Math.random()*12}s;
    `;
    container.appendChild(p);
  }
}

// ── Boot: load students + settings once ───────────────────────────
async function boot() {
  createParticles();
  startSlideshow();
  try {
    // Live listener for students — updates instantly when new classes are added
    onSnapshot(studentsCol, snap => {
      students = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      refreshAllFilters();
      // If student page is visible, refresh its name list too
      const stuApp = document.getElementById("student-app");
      if (stuApp && stuApp.style.display !== "none" && window._activeSession) {
        const sel = document.getElementById("s-name");
        if (sel) {
          const cls = students.filter(s => s.cls === window._activeSession.cls);
          const cur = sel.value;
          sel.innerHTML = '<option value="">— select your name —</option>' +
            cls.map(s => `<option value="${s.id}"${s.id === cur ? " selected" : ""}>${s.name}</option>`).join("");
        }
      }
    });

    const sSnap = await getDoc(settingsDoc);
    if (sSnap.exists()) teacherPin = sSnap.data().pin || "1234";
  } catch (e) {
    console.warn("Boot error:", e);
  }
  // Route: saved teacher device OR #teacher hash → teacher login
  // Everything else → student sign-in
  const savedRole = localStorage.getItem("att_role");
  if (window.location.hash === "#teacher" || savedRole === "teacher") {
    showTeacherLogin();
  } else {
    showPage("student");
  }
}

// ── Page routing ──────────────────────────────────────────────────
function showPage(page) {
  ["home-page", "student-app", "teacher-app"].forEach(id =>
    document.getElementById(id).style.display = "none"
  );
  if (unsubSessions) { unsubSessions(); unsubSessions = null; }
  if (unsubRecords)  { unsubRecords();  unsubRecords  = null; }
  clearInterval(countdownTimer);

  if (page === "student") {
    document.getElementById("student-app").style.display = "flex";
    initStudentPage();
  } else if (page === "teacher") {
    document.getElementById("teacher-app").style.display = "flex";
    initTeacher();
  }
}
window.showPage = showPage;

// Sign out of teacher mode (clears saved role)
window.teacherSignOut = function () {
  localStorage.removeItem("att_role");
  window.location.hash = "";
  showPage("student");
};

function showTeacherLogin() {
  document.getElementById("home-page").style.display = "flex";
  // Hide student/teacher choice buttons, only show PIN modal
  document.querySelector(".home-options").style.display = "none";
  document.getElementById("pin-modal").style.display = "flex";
  setTimeout(() => document.getElementById("pin-input").focus(), 100);
}

// ── Teacher login ─────────────────────────────────────────────────
window.teacherLogin = function () {
  document.getElementById("pin-modal").style.display = "flex";
  document.getElementById("pin-input").value = "";
  document.getElementById("pin-error").style.display = "none";
  setTimeout(() => document.getElementById("pin-input").focus(), 100);
};

window.checkPin = function () {
  const val = document.getElementById("pin-input").value;
  if (val === teacherPin) {
    document.getElementById("pin-modal").style.display = "none";
    document.querySelector(".home-options").style.display = "block";
    // Remember this device is the teacher's device
    localStorage.setItem("att_role", "teacher");
    showPage("teacher");
  } else {
    document.getElementById("pin-error").style.display = "block";
    document.getElementById("pin-input").value = "";
  }
};

// ── STUDENT PAGE ──────────────────────────────────────────────────
function deviceSignedInKey(sessId) { return `att_signed_${sessId}`; }
function deviceHasSigned(sessId) { return !!localStorage.getItem(deviceSignedInKey(sessId)); }
function markDeviceSigned(sessId, studentName) {
  localStorage.setItem(deviceSignedInKey(sessId), studentName);
}

// Store GPS coords once obtained
let studentGPS = null;

window.requestGPS = async function () {
  const errEl = document.getElementById("s-gps-error");
  const btn   = document.querySelector("#s-gps-prompt .btn-primary");
  btn.textContent = "Getting location…";
  btn.disabled = true;
  errEl.style.display = "none";
  try {
    const pos = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, {
        enableHighAccuracy: true, maximumAge: 0, timeout: 15000
      })
    );
    studentGPS = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const session = window._pendingSession;
    document.getElementById("s-gps-prompt").style.display = "none";
    showStudentState("form", session);
  } catch(e) {
    btn.textContent = "Allow location & continue";
    btn.disabled = false;
    const isPWA = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
    if (e.code === 1) {
      if (isPWA) {
        errEl.innerHTML = "<strong>Location blocked for this app.</strong><br><br>" +
          "<b>iPhone:</b> Go to Settings → Privacy & Security → Location Services → find this app → set to <b>While Using</b>.<br><br>" +
          "<b>Android:</b> Go to Settings → Apps → this app → Permissions → Location → Allow.";
      } else {
        errEl.innerHTML = "<strong>Location was denied.</strong><br><br>" +
          "Tap the <b>lock icon</b> in your browser address bar → <b>Location</b> → <b>Allow</b>, then tap the button again.";
      }
    } else if (e.code === 2) {
      errEl.textContent = "GPS signal not found. Move to an area with better signal, make sure Location Services is ON, and try again.";
    } else {
      errEl.textContent = "Location timed out. Make sure GPS is turned on and try again.";
    }
    errEl.style.display = "block";
  }
};

// Track which screen the student is currently on so GPS updates don't reset them
let studentCurrentState = null;

function initStudentPage() {
  studentGPS = null;
  studentCurrentState = null;
  showStudentState("loading");

  const q = query(sessionsCol, where("date", "==", today()), where("open", "==", true));
  unsubSessions = onSnapshot(q, snap => {
    const now = Date.now();
    const allOpen = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(s => now < new Date(s.lock).getTime());

    const notYet = allOpen.find(s => now < new Date(s.start).getTime());
    const active = allOpen.find(s => now >= new Date(s.start).getTime());

    if (active) {
      // Update session reference silently (for fresh GPS coords) without resetting the UI
      if (window._activeSession && window._activeSession.id === active.id) {
        window._activeSession = active; // update coords quietly
        return; // don't touch the UI — student may be typing the code
      }

      if (deviceHasSigned(active.id)) {
        const name = localStorage.getItem(deviceSignedInKey(active.id));
        showStudentState("already-signed", { name });
      } else if (active.lat && !studentGPS) {
        window._pendingSession = active;
        showStudentState("gps-prompt");
      } else {
        showStudentState("form", active);
      }
    } else if (notYet) {
      if (studentCurrentState !== "not-started") {
        showStudentState("not-started", notYet);
      } else {
        window._pendingSession = notYet; // update quietly
      }
    } else {
      getDocs(query(sessionsCol, where("date", "==", today()))).then(all => {
        showStudentState(all.empty ? "none" : "locked");
      });
    }
  });
}

function showStudentState(state, session) {
  studentCurrentState = state;
  ["s-loading", "s-no-session", "s-locked", "s-success-screen", "s-form", "s-already-signed", "s-code-gate", "s-gps-prompt", "s-not-started"]
    .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = "none"; });

  if (state === "loading") {
    document.getElementById("s-loading").style.display = "block";
  } else if (state === "none") {
    document.getElementById("s-no-session").style.display = "block";
  } else if (state === "locked") {
    document.getElementById("s-locked").style.display = "block";
  } else if (state === "already-signed") {
    document.getElementById("s-already-signed").style.display = "block";
    document.getElementById("s-already-name").textContent = session.name || "You";
  } else if (state === "gps-prompt") {
    document.getElementById("s-gps-prompt").style.display = "block";
  } else if (state === "not-started") {
    document.getElementById("s-not-started").style.display = "block";
    document.getElementById("s-not-started-class").textContent = session.cls;
    startPreCountdown(session);
  } else if (state === "form") {
    // Show code entry first, then sign-in form after verification
    document.getElementById("s-code-gate").style.display = "block";
    document.getElementById("s-class-name-gate").textContent = session.cls;
    document.getElementById("s-code-input").value = "";
    document.getElementById("s-code-error").style.display = "none";
    window._activeSession = session;
    startCountdown(session);
  } else if (state === "form-verified") {
    document.getElementById("s-form").style.display = "block";
    document.getElementById("s-class-name").textContent = session.cls;
    document.getElementById("s-date").textContent = new Date().toLocaleDateString("en-GB", {
      weekday: "long", year: "numeric", month: "long", day: "numeric"
    });
    const sel = document.getElementById("s-name");
    const cls = students.filter(s => s.cls === session.cls);
    sel.innerHTML = '<option value="">— select your name —</option>' +
      cls.map(s => `<option value="${s.id}">${s.name}</option>`).join("");
  }
}

// Pre-start countdown (counts down to session start time)
let preCountdownTimer = null;
function startPreCountdown(sess) {
  clearInterval(preCountdownTimer);
  preCountdownTimer = setInterval(() => {
    const rem = new Date(sess.start).getTime() - Date.now();
    if (rem <= 0) {
      clearInterval(preCountdownTimer);
      // Session has now started — re-init to pick it up
      initStudentPage();
      return;
    }
    const h = Math.floor(rem / 3600000);
    const m = Math.floor((rem % 3600000) / 60000);
    const s = Math.floor((rem % 60000) / 1000);
    const el = document.getElementById("s-pre-countdown");
    if (el) {
      el.textContent = h > 0
        ? `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`
        : `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
    }
    const timeEl = document.getElementById("s-start-time");
    if (timeEl) timeEl.textContent = fmtTime(sess.start);
  }, 1000);
}

// Distance between two GPS coords in metres (Haversine)
function distanceM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

window.verifyCode = async function () {
  const session = window._activeSession;
  if (!session) return;
  const entered = document.getElementById("s-code-input").value.trim();
  const errEl   = document.getElementById("s-code-error");
  const btn     = document.getElementById("s-verify-btn");

  if (entered !== session.code) {
    errEl.textContent = "Incorrect code. Check and try again.";
    errEl.style.display = "block";
    return;
  }

  // Code correct — now check location using already-obtained GPS
  if (session.lat && session.lng) {
    if (!studentGPS) {
      errEl.textContent = "Location not available. Please go back and allow location access.";
      errEl.style.display = "block";
      return;
    }
    const dist = distanceM(studentGPS.lat, studentGPS.lng, session.lat, session.lng);
    if (dist > session.radiusM) {
      errEl.textContent = `You must be on campus to sign in. You appear to be ${Math.round(dist)}m away from the classroom.`;
      errEl.style.display = "block";
      return;
    }
  }

  // All checks passed — show the actual sign-in form
  document.getElementById("s-code-gate").style.display = "none";
  showStudentState("form-verified", session);
};

window.selectStatus = function (input) {
  document.getElementById("opt-present").classList.remove("selected-present");
  document.getElementById("opt-late").classList.remove("selected-late");
  if (input.value === "present") document.getElementById("opt-present").classList.add("selected-present");
  if (input.value === "late")    document.getElementById("opt-late").classList.add("selected-late");
};

window.submitAttendance = async function () {
  const session = window._activeSession;
  if (!session) return initStudentPage();
  const sid = document.getElementById("s-name").value;
  if (!sid) return alert("Please select your name.");
  const status = document.querySelector('input[name="status"]:checked').value;
  const student = students.find(s => s.id === sid);

  document.getElementById("s-submitting").style.display = "block";
  document.querySelector("#s-form .btn-primary").style.display = "none";

  try {
    const recId = `${session.id}_${sid}`;
    await setDoc(doc(recordsCol, recId), {
      sid, sessId: session.id, cls: session.cls,
      date: today(), status, name: student.name,
      time: fmtTime(new Date()), ts: serverTimestamp()
    });

    // Lock this device for this session
    markDeviceSigned(session.id, student.name);

    document.getElementById("s-form").style.display = "none";
    document.getElementById("s-success-screen").style.display = "block";
    document.getElementById("s-success-name").textContent = `Hi ${student.name}!`;
    document.getElementById("s-success-msg").textContent =
      `Marked as ${status} for ${session.cls} at ${fmtTime(new Date())}.`;
  } catch (e) {
    alert("Could not save. Check your internet connection and try again.");
    document.getElementById("s-submitting").style.display = "none";
    document.querySelector("#s-form .btn-primary").style.display = "block";
  }
};

window.resetStudentForm = function () { initStudentPage(); };

function startCountdown(sess) {
  clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    const rem = new Date(sess.lock).getTime() - Date.now();
    if (rem <= 0) {
      clearInterval(countdownTimer);
      return;
    }
    const m = Math.floor(rem / 60000);
    const s = Math.floor((rem % 60000) / 1000);
    const el = document.getElementById("s-countdown");
    if (el) {
      el.textContent = `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
      el.classList.toggle("urgent", rem < 120000);
    }
  }, 1000);
}

// ── TEACHER PAGE ──────────────────────────────────────────────────
function initTeacher() {
  populateFilter("t-sess-class", false);
  populateFilter("t-rec-class",  true);
  populateFilter("t-abs-class",  true);
  populateFilter("t-filter-class", true);
  document.getElementById("t-rec-date").value = today();

  refreshAllFilters();

  // Live listeners
  unsubSessions = onSnapshot(sessionsCol, snap => {
    sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderSessions();
  });
  unsubRecords = onSnapshot(recordsCol, snap => {
    records = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const active = document.querySelector(".tab.active");
    const tabName = active ? active.textContent.toLowerCase().trim() : "";
    if (tabName === "records")  renderRecords();
    if (tabName === "absences") renderAbsences();
    if (tabName === "stats")    renderStats();
  });

  switchTab("sessions", document.querySelector(".tab"));
}

window.switchTab = function (tab, btn) {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById("tab-" + tab).classList.add("active");
  if (tab === "sessions") renderSessions();
  if (tab === "records")  renderRecords();
  if (tab === "absences") renderAbsences();
  if (tab === "stats")    renderStats();
  if (tab === "students") renderStudents();
};

function populateFilter(id, allOption) {
  const sel = document.getElementById(id);
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = (allOption ? '<option value="">All classes</option>' : '<option value="">— select class —</option>') +
    classes().map(c => `<option value="${c}"${c === cur ? " selected" : ""}>${c}</option>`).join("");
}

function refreshAllFilters() {
  populateFilter("t-sess-class",    false);
  populateFilter("t-rec-class",     true);
  populateFilter("t-abs-class",     true);
  populateFilter("t-filter-class",  true);
}

// ── Sessions ──────────────────────────────────────────────────────
function genCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// Live location tracking — polls every 10s using fresh getCurrentPosition
const locationIntervals = {}; // sessId -> intervalId

async function pushLocation(sessId) {
  if (!navigator.geolocation) return;
  try {
    const pos = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, {
        enableHighAccuracy: true,
        maximumAge: 0,        // always force a fresh reading, never use cache
        timeout: 8000
      })
    );
    await setDoc(doc(sessionsCol, sessId), {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      locUpdated: new Date().toISOString(),
      locAccuracy: Math.round(pos.coords.accuracy)
    }, { merge: true });
    console.log(`[Location] Pushed for session ${sessId}: ${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)} (±${Math.round(pos.coords.accuracy)}m)`);
    // Update the status banner with latest accuracy
    const banner = document.getElementById("loc-status-banner");
    if (banner && banner.style.display !== "none") {
      banner.textContent = `✓ Location live · ±${Math.round(pos.coords.accuracy)}m accuracy · ${fmtTime(new Date())}`;
      banner.style.display = "flex";
    }
  } catch(e) {
    console.warn("[Location] Failed to get position:", e.message);
  }
}

function startLiveLocation(sessId) {
  if (!navigator.geolocation) return;
  stopLiveLocation(sessId); // clear any existing
  pushLocation(sessId);     // push immediately
  locationIntervals[sessId] = setInterval(() => pushLocation(sessId), 10000); // then every 10s
}

function stopLiveLocation(sessId) {
  if (locationIntervals[sessId]) {
    clearInterval(locationIntervals[sessId]);
    delete locationIntervals[sessId];
  }
}

// Manually refresh location for a session (call from teacher dashboard)
window.refreshLocation = async function(sessId) {
  const btn = event.target;
  const orig = btn.textContent;
  btn.textContent = "Getting GPS…";
  btn.disabled = true;
  try {
    const pos = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, {
        enableHighAccuracy: true, maximumAge: 0, timeout: 15000
      })
    );
    await setDoc(doc(sessionsCol, sessId), {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      locUpdated: new Date().toISOString(),
      locAccuracy: Math.round(pos.coords.accuracy)
    }, { merge: true });
    const acc = Math.round(pos.coords.accuracy);
    btn.textContent = orig;
    btn.disabled = false;
    showLocStatus(`✓ Location updated · ±${acc}m accuracy${acc > 50 ? " — WARNING: low accuracy, use your phone" : ""}`, acc > 50 ? "amber" : "green");
  } catch(e) {
    btn.textContent = orig;
    btn.disabled = false;
    showLocStatus("✗ Could not get location. Make sure GPS is enabled.", "amber");
  }
};

function showLocStatus(msg, type) {
  let el = document.getElementById("loc-status-banner");
  if (!el) {
    el = document.createElement("div");
    el.id = "loc-status-banner";
    el.style.cssText = "margin-bottom:12px;padding:10px 14px;border-radius:10px;font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px;animation:fadeInDown 0.4s ease";
    const tab = document.getElementById("tab-sessions");
    if (tab) tab.insertBefore(el, tab.firstChild);
  }
  if (type === "green") {
    el.style.background = "rgba(59,109,17,0.35)";
    el.style.border = "1px solid rgba(125,196,58,0.5)";
    el.style.color = "#b5e87a";
  } else {
    el.style.background = "rgba(133,79,11,0.35)";
    el.style.border = "1px solid rgba(240,168,48,0.5)";
    el.style.color = "#fcd07a";
  }
  el.textContent = msg;
  // Auto-hide after 6 seconds
  setTimeout(() => { if (el) el.style.display = "none"; }, 6000);
}

// Manually re-capture location for an already-open session
window.recaptureLocation = async function (sessId) {
  if (!navigator.geolocation) return alert("GPS not available on this device.");
  showLocStatus("Getting fresh location…", "amber");
  try {
    const pos = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, {
        enableHighAccuracy: true, maximumAge: 0, timeout: 12000
      })
    );
    await setDoc(doc(sessionsCol, sessId), {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      locUpdated: new Date().toISOString(),
      locAccuracy: Math.round(pos.coords.accuracy)
    }, { merge: true });
    showLocStatus(`✓ Location updated · ±${Math.round(pos.coords.accuracy)}m accuracy · ${fmtTime(new Date())}`, "green");
    // Restart live tracking with new position
    startLiveLocation(sessId);
  } catch(e) {
    showLocStatus("⚠ Could not get location. Try again or use your phone.", "amber");
  }
};

window.openSession = async function () {
  const cls  = document.getElementById("t-sess-class").value;
  const t    = document.getElementById("t-sess-time").value;
  const tEnd = document.getElementById("t-sess-end").value;

  if (!cls)  { alert("Please select a class."); return; }
  if (!t)    { alert("Please set a start time."); return; }
  if (!tEnd) { alert("Please set an end time."); return; }

  const [h, m]   = t.split(":").map(Number);
  const [he, me] = tEnd.split(":").map(Number);
  const start = new Date(); start.setHours(h, m, 0, 0);
  const lock  = new Date(); lock.setHours(he, me, 0, 0);
  if (lock <= start) { alert("End time must be after start time."); return; }

  const btn = document.getElementById("open-session-btn");
  if (btn) { btn.textContent = "Getting location…"; btn.disabled = true; }

  let lat = null, lng = null;
  try {
    const pos = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, {
        enableHighAccuracy: true, maximumAge: 0, timeout: 10000
      })
    );
    lat = pos.coords.latitude;
    lng = pos.coords.longitude;
  } catch(e) {
    const proceed = confirm("Could not get your location.\nOpen session with code-only verification?");
    if (!proceed) {
      if (btn) { btn.textContent = "Open session"; btn.disabled = false; }
      return;
    }
  }

  if (btn) { btn.textContent = "Opening…"; btn.disabled = true; }

  try {
    const code = genCode();
    const id   = uid();
    await setDoc(doc(sessionsCol, id), {
      cls, date: today(),
      start: start.toISOString(),
      lock:  lock.toISOString(),
      open:  true, code,
      lat, lng,
      locUpdated: lat ? new Date().toISOString() : null,
      radiusM: 500
    });
    if (lat !== null) startLiveLocation(id);
  } catch(e) {
    console.error("openSession error:", e);
    alert("Failed to open session: " + (e.message || e.code || String(e)));
  }

  if (btn) { btn.textContent = "Open session"; btn.disabled = false; }
};

window.closeSession = async function (id) {
  stopLiveLocation(id);
  await setDoc(doc(sessionsCol, id), { open: false }, { merge: true });
};

function renderSessions() {
  const todaySess = sessions.filter(s => s.date === today());
  const active = todaySess.filter(s => s.open);
  const past   = todaySess.filter(s => !s.open);

  // Resume live location tracking for any open sessions (e.g. after page reload)
  active.forEach(s => {
    if (s.lat && !locationIntervals[s.id]) startLiveLocation(s.id);
  });
  // Stop tracking for sessions that are now closed
  past.forEach(s => stopLiveLocation(s.id));

  document.getElementById("t-active-sessions").innerHTML = active.map(s => `
    <div class="session-item active-sess" style="flex-direction:column;align-items:stretch">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div>
          <div class="session-item-name">${s.cls}</div>
          <div class="session-item-sub">Started ${fmtTime(s.start)} · locks ${fmtTime(s.lock)}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="badge badge-open">Open</span>
          <button class="btn btn-danger small-btn" onclick="closeSession('${s.id}')">Close</button>
        </div>
      </div>
      <div class="code-display">
        <div class="code-label">Write this code on the board</div>
        <div class="code-digits">${s.code || "----"}</div>
        <div class="code-hint">${s.lat ? "✓ Location (500m) + code" : "⚠ Code only — no GPS"}</div>
      </div>
    </div>`).join("");

  document.getElementById("t-past-sessions").innerHTML = past.length
    ? past.map(s => {
        const count = records.filter(r => r.sessId === s.id).length;
        return `<div class="session-item">
          <div>
            <div class="session-item-name">${s.cls}</div>
            <div class="session-item-sub">${fmtTime(s.start)} — ${count} signed in</div>
          </div>
          <span class="badge badge-closed">Closed</span>
        </div>`;
      }).join("")
    : '<p class="muted small">No completed sessions yet.</p>';
}

// ── Records ───────────────────────────────────────────────────────
window.renderRecords = function () {
  const d   = document.getElementById("t-rec-date").value || today();
  const cls = document.getElementById("t-rec-class").value;
  const filtered  = students.filter(s => !cls || s.cls === cls);
  const dayRecs   = records.filter(r => r.date === d);

  document.getElementById("t-rec-body").innerHTML = filtered.map(s => {
    const r = dayRecs.find(x => x.sid === s.id);
    const status = r ? r.status : "absent";
    return `<tr>
      <td style="width:38%">${s.name}</td>
      <td style="width:24%">${s.cls}</td>
      <td style="width:20%"><span class="badge badge-${status}">${status}</span></td>
      <td style="width:18%">${r ? r.time : "—"}</td>
    </tr>`;
  }).join("") || '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:1.5rem">No data.</td></tr>';
};

// ── Absences ──────────────────────────────────────────────────────
window.renderAbsences = function () {
  const cls = document.getElementById("t-abs-class").value;
  const allDates  = [...new Set(records.map(r => r.date))];
  const totalDays = allDates.length || 1;

  document.getElementById("t-abs-body").innerHTML = students
    .filter(s => !cls || s.cls === cls)
    .map(s => {
      const sr     = records.filter(r => r.sid === s.id);
      const absent = totalDays - sr.length;
      const late   = sr.filter(r => r.status === "late").length;
      const rate   = Math.round(((totalDays - absent) / totalDays) * 100);
      const col    = rate >= 90 ? "var(--green)" : rate >= 75 ? "var(--amber)" : "var(--red)";
      return `<tr>
        <td style="width:32%">${s.name}</td>
        <td style="width:22%">${s.cls}</td>
        <td style="width:14%;color:var(--red)">${absent}</td>
        <td style="width:14%;color:var(--amber)">${late}</td>
        <td style="width:18%;font-weight:600;color:${col}">${rate}%</td>
      </tr>`;
    }).join("") || '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:1.5rem">No students.</td></tr>';
};

// ── Stats ─────────────────────────────────────────────────────────
function renderStats() {
  const allDates  = [...new Set(records.map(r => r.date))];
  const totalDays = allDates.length || 1;
  const exp  = students.length * totalDays;
  const pres = records.length;
  const rate = exp ? Math.round((pres / exp) * 100) : 0;
  const cls  = classes();

  document.getElementById("t-stat-cards").innerHTML = `
    <div class="metric-card"><div class="metric-val">${students.length}</div><div class="metric-lbl">Students</div></div>
    <div class="metric-card"><div class="metric-val">${cls.length}</div><div class="metric-lbl">Classes</div></div>
    <div class="metric-card"><div class="metric-val" style="color:var(--green)">${rate}%</div><div class="metric-lbl">Attendance rate</div></div>
    <div class="metric-card"><div class="metric-val" style="color:var(--red)">${exp - pres}</div><div class="metric-lbl">Total absences</div></div>`;

  document.getElementById("t-class-bars").innerHTML = cls.map(c => {
    const ids = students.filter(s => s.cls === c).map(s => s.id);
    const e = ids.length * totalDays;
    const p = records.filter(r => ids.includes(r.sid)).length;
    const r = e ? Math.round((p / e) * 100) : 0;
    return `<div class="bar-row">
      <span class="bar-label">${c}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${r}%"></div></div>
      <span class="bar-pct">${r}%</span>
    </div>`;
  }).join("");

  const days = ["Mon","Tue","Wed","Thu","Fri"];
  const d = new Date(), dow = d.getDay();
  document.getElementById("t-week-bars").innerHTML = days.map((day, i) => {
    const wd = new Date(d); wd.setDate(d.getDate() - dow + i + 1);
    const ds = wd.toISOString().slice(0, 10);
    const dr = records.filter(r => r.date === ds).length;
    const r  = students.length ? Math.round((dr / students.length) * 100) : 0;
    return `<div class="bar-row">
      <span class="bar-label">${day}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${r}%"></div></div>
      <span class="bar-pct">${r}%</span>
    </div>`;
  }).join("");
}

// ── Students ──────────────────────────────────────────────────────
function renderStudents() {
  const cls      = document.getElementById("t-filter-class").value;
  const filtered = students.filter(s => !cls || s.cls === cls);
  document.getElementById("t-student-count").textContent =
    `${filtered.length} student${filtered.length !== 1 ? "s" : ""}`;
  document.getElementById("t-student-body").innerHTML = filtered.map(s => `
    <tr>
      <td style="width:48%">${s.name}</td>
      <td style="width:36%">${s.cls}</td>
      <td style="width:16%;text-align:right">
        <button class="btn btn-danger" style="padding:4px 8px;font-size:12px" onclick="removeStudent('${s.id}')">✕</button>
      </td>
    </tr>`).join("") ||
    '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:1.5rem">No students yet. Import from Excel above.</td></tr>';
}

window.addStudent = async function () {
  const name = document.getElementById("t-add-name").value.trim();
  const cls  = document.getElementById("t-add-class").value.trim();
  if (!name || !cls) return alert("Please fill in both name and class.");
  const id = uid();
  await setDoc(doc(studentsCol, id), { name, cls });
  students.push({ id, name, cls });
  document.getElementById("t-add-name").value = "";
  document.getElementById("t-add-class").value = "";
  renderStudents();
  populateFilter("t-sess-class", false);
  populateFilter("t-filter-class", true);
};

window.removeStudent = async function (id) {
  if (!confirm("Remove this student?")) return;
  await deleteDoc(doc(studentsCol, id));
  students = students.filter(s => s.id !== id);
  renderStudents();
};

window.clearStudents = async function () {
  if (!confirm("Remove ALL students? This cannot be undone.")) return;
  await Promise.all(students.map(s => deleteDoc(doc(studentsCol, s.id))));
  students = [];
  renderStudents();
};

// ── Excel / CSV import ────────────────────────────────────────────
window.handleFile = function (input) {
  const file = input.files[0];
  if (!file) return;
  const msg   = document.getElementById("import-msg");
  const isCSV = file.name.toLowerCase().endsWith(".csv");

  const reader = new FileReader();
  reader.onload = async function (e) {
    try {
      let rows = [];
      if (isCSV) {
        const lines   = e.target.result.split("\n").map(l => l.trim()).filter(Boolean);
        const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g,"").trim().toLowerCase());
        const ni = headers.findIndex(h => h.includes("name"));
        const ci = headers.findIndex(h => h.includes("class") || h.includes("grade") || h.includes("group"));
        if (ni === -1 || ci === -1) { showImportMsg(msg, false, 'Could not find "Name" and "Class" columns.'); return; }
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(",").map(c => c.replace(/^"|"$/g,"").trim());
          if (cols[ni] && cols[ci]) rows.push({ name: cols[ni], cls: cols[ci] });
        }
      } else {
        const data = new Uint8Array(e.target.result);
        const wb   = XLSX.read(data, { type: "array" });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
        const keys = json.length ? Object.keys(json[0]) : [];
        const nk   = keys.find(k => k.toLowerCase().includes("name"));
        const ck   = keys.find(k => k.toLowerCase().includes("class") || k.toLowerCase().includes("grade") || k.toLowerCase().includes("group"));
        if (!nk || !ck) { showImportMsg(msg, false, 'Could not find "Name" and "Class" columns.'); return; }
        rows = json.filter(r => r[nk] && r[ck]).map(r => ({ name: String(r[nk]).trim(), cls: String(r[ck]).trim() }));
      }

      if (!rows.length) { showImportMsg(msg, false, "No valid rows found in the file."); return; }

      const existing = new Set(students.map(s => s.name.toLowerCase() + "|" + s.cls.toLowerCase()));
      const newRows  = rows.filter(r => !existing.has(r.name.toLowerCase() + "|" + r.cls.toLowerCase()));

      showImportMsg(msg, true, `Uploading ${newRows.length} students…`);
      await Promise.all(newRows.map(r => {
        const id = uid();
        students.push({ id, ...r });
        return setDoc(doc(studentsCol, id), r);
      }));

      showImportMsg(msg, true,
        `${newRows.length} student${newRows.length !== 1 ? "s" : ""} imported. ${rows.length - newRows.length} duplicate${rows.length - newRows.length !== 1 ? "s" : ""} skipped.`);
      renderStudents();
      refreshAllFilters();
    } catch (err) {
      showImportMsg(msg, false, "Error reading file. Please use a valid Excel (.xlsx) or CSV file.");
    }
    input.value = "";
  };
  isCSV ? reader.readAsText(file) : reader.readAsArrayBuffer(file);
};

function showImportMsg(el, ok, text) {
  el.style.display    = "block";
  el.style.background = ok ? "var(--green-light)" : "var(--red-light)";
  el.style.color      = ok ? "var(--green)"       : "var(--red)";
  el.style.border     = `1px solid ${ok ? "#97C459" : "#F7C1C1"}`;
  el.textContent      = text;
}

// ── Export CSV ────────────────────────────────────────────────────
window.exportCSV = function () {
  const d   = document.getElementById("t-rec-date").value || today();
  const cls = document.getElementById("t-rec-class").value;
  const filtered = students.filter(s => !cls || s.cls === cls);
  const rows = [["Name","Class","Status","Time"]];
  filtered.forEach(s => {
    const r = records.find(x => x.sid === s.id && x.date === d);
    rows.push([s.name, s.cls, r ? r.status : "absent", r ? r.time : ""]);
  });
  const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
  const a   = document.createElement("a");
  a.href    = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
  a.download = `attendance_${cls || "all"}_${d}.csv`;
  a.click();
};

// Show PWA location note if running as installed app
const isPWAInstalled = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
if (isPWAInstalled) {
  const note = document.getElementById("pwa-loc-note");
  if (note) note.style.display = "block";
}

// ── Start ─────────────────────────────────────────────────────────
// Re-route when hash changes (e.g. teacher taps home then navigates back)
window.addEventListener("hashchange", () => {
  if (window.location.hash === "#teacher") {
    showTeacherLogin();
  } else {
    showPage("student");
  }
});

boot();
