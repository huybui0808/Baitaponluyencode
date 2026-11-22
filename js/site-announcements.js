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

function noticeDialog(notice, onClose) {
  const overlay = document.createElement('div');
  overlay.className = 'site-announcement-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'siteAnnouncementTitle');
  const card = document.createElement('div');
  card.className = 'site-announcement-card';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'site-announcement-close';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Đóng thông báo và tải lại trang');
  close.addEventListener('click', () => window.location.reload(), { once: true });
  const eyebrow = document.createElement('div');
  eyebrow.className = 'site-announcement-eyebrow';
  eyebrow.textContent = 'Thông báo cập nhật';
  const title = document.createElement('h2');
  title.id = 'siteAnnouncementTitle';
  title.textContent = notice.title;
  const body = document.createElement('p');
  body.textContent = notice.body;
  card.append(close, eyebrow, title, body);
  overlay.append(card);
  document.body.append(overlay);
  close.focus();
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
      noticeDialog(notice, () => {
        active = false;
        void check();
      });
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
