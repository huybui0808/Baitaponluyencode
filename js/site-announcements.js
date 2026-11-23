// VI: Mỗi thông báo chỉ hiện một lần cho mỗi tài khoản; khách dùng bộ nhớ trình duyệt.
// EN: Show each manual notice once per account, or once per guest browser.
const SEEN_KEY = 'onluyencpp_site_announcements_seen_v1';

function readSeen(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value.filter(Number.isSafeInteger) : [];
  } catch (_) {
    return [];
  }
}

function noticeDialog(notice) {
  const overlay = document.createElement('div');
  overlay.className = 'site-announcement-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'siteAnnouncementTitle');
  const card = document.createElement('div');
  card.className = 'site-announcement-card';
  const accent = document.createElement('div');
  accent.className = 'site-announcement-accent';
  accent.setAttribute('aria-hidden', 'true');
  card.tabIndex = -1;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'site-announcement-dismiss';
  close.disabled = true;
  close.textContent = 'Đóng được sau 5 giây';
  close.setAttribute('aria-label', 'Nút đóng thông báo đang chờ 5 giây');
  const footer = document.createElement('div');
  footer.className = 'site-announcement-footer';
  const hint = document.createElement('p');
  hint.textContent = 'Vui lòng đọc nội dung trước khi đóng thông báo.';
  const timerText = document.createElement('span');
  timerText.className = 'site-announcement-timer';
  timerText.setAttribute('role', 'status');
  timerText.textContent = 'Nút đóng sẽ mở sau 5 giây.';
  close.addEventListener('click', () => {
    if (close.disabled) return;
    clearInterval(countdownTimer);
    overlay.remove();
  }, { once: true });
  const eyebrow = document.createElement('div');
  eyebrow.className = 'site-announcement-eyebrow';
  const icon = document.createElement('span');
  icon.className = 'site-announcement-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '📣';
  const label = document.createElement('span');
  label.textContent = 'Thông báo cập nhật';
  eyebrow.append(icon, label);
  const title = document.createElement('h2');
  title.id = 'siteAnnouncementTitle';
  title.textContent = notice.title;
  const body = document.createElement('p');
  body.className = 'site-announcement-body';
  body.textContent = notice.body;
  footer.append(hint, timerText, close);
  card.append(accent, eyebrow, title, body, footer);
  overlay.append(card);
  document.body.append(overlay);
  card.focus();
  let secondsRemaining = 5;
  const countdownTimer = setInterval(() => {
    secondsRemaining -= 1;
    if (secondsRemaining <= 0) {
      clearInterval(countdownTimer);
      close.disabled = false;
      close.textContent = 'Đóng thông báo';
      close.setAttribute('aria-label', 'Đóng thông báo');
      timerText.textContent = 'Bạn có thể đóng thông báo.';
      return;
    }
    close.textContent = `Đóng được sau ${secondsRemaining} giây`;
    timerText.textContent = `Nút đóng sẽ mở sau ${secondsRemaining} giây.`;
  }, 1000);
}

export function initSiteAnnouncements(getClient, getUser) {
  let active = false;
  let pending = false;
  let missingRpcWarned = false;
  const sessionSeen = new Map();
  const seenKey = () => `${SEEN_KEY}:${getUser()?.id || 'guest'}`;
  const seenFor = (key) => [...new Set([
    ...readSeen(key), ...(sessionSeen.get(key) || []),
    ...(key.endsWith(':guest') ? [] : readSeen(`${SEEN_KEY}:guest`)),
  ])];

  async function check() {
    if (active || pending || document.hidden || !navigator.onLine) return;
    const client = getClient();
    if (!client) return;
    pending = true;
    try {
      const key = seenKey();
      const { data, error } = await client.rpc('claim_next_site_announcement', {
        p_seen_ids: seenFor(key),
      });
      if (error) {
        if (!missingRpcWarned) {
          console.warn('Không tải được thông báo cập nhật:', error.message);
          missingRpcWarned = true;
        }
        return;
      }
      const notice = data?.[0];
      if (!notice || !Number.isSafeInteger(Number(notice.id))) return;
      const id = Number(notice.id);
      const seen = seenFor(key);
      if (!seen.includes(id)) {
        seen.push(id);
        try { localStorage.setItem(key, JSON.stringify(seen)); } catch (_) {}
      }
      sessionSeen.set(key, new Set(seen));
      active = true;
      noticeDialog(notice);
    } catch (error) {
      console.warn('Không hiển thị được thông báo cập nhật:', error);
    } finally {
      pending = false;
    }
  }

  window.addEventListener('online', () => void check());
  window.addEventListener('site-announcement-published', () => void check());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void check(); });
  setInterval(() => { if (!document.hidden) void check(); }, 30000);
  void check();
  return check;
}
