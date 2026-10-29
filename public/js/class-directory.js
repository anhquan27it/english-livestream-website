// Tìm kiếm/lọc/phân trang dùng chung cho danh sách lớp của hai vai trò.
class ClassDirectory {
  constructor(role, onRender) {
    this.role = role;
    this.onRender = onRender;
    this.items = [];
    this.page = 1;
    this.size = 12;
    this.view = 'grid';
    this.host = document.getElementById('classTools');
    this.host.innerHTML = `
      <div class="catalog-filters">
        <label class="catalog-search"><i data-lucide="search"></i><input class="input" type="search" id="classSearch" placeholder="${role === 'teacher' ? 'Tìm tên lớp, mã lớp…' : 'Tìm tên lớp, giáo viên…'}" aria-label="Tìm lớp học" /></label>
        <label class="catalog-filter">Trạng thái<select class="input" id="classStatus">
          <option value="all">Tất cả trạng thái</option><option value="live">Đang live</option>
          ${role === 'teacher' ? '<option value="pending">Có yêu cầu chờ duyệt</option><option value="idle">Chưa lên sóng</option>' : '<option value="member">Đã tham gia</option><option value="pending">Chờ duyệt</option>'}
        </select></label>
        <label class="catalog-filter">Trình độ<select class="input" id="classLevel"><option value="">Tất cả trình độ</option></select></label>
      </div>
      <div class="catalog-options">
        <div class="catalog-result"><p id="classResult" role="status" aria-live="polite"></p><button class="btn btn-ghost btn-sm" id="clearClassFilters" hidden>Xóa bộ lọc</button></div>
        <div class="catalog-display">
          <label class="catalog-sort">Sắp xếp<select id="classSort" class="input"><option value="priority">Ưu tiên lớp đang live</option><option value="name">Tên lớp A–Z</option><option value="students">Số học sinh nhiều nhất</option></select></label>
          <div class="catalog-views" role="group" aria-label="Cách hiển thị lớp">
            <button class="icon-btn" data-view="list" aria-label="Dạng danh sách"><i data-lucide="list"></i></button>
            <button class="icon-btn" data-view="grid" aria-label="Dạng thẻ"><i data-lucide="layout-grid"></i></button>
          </div>
        </div>
      </div>`;
    this.search = this.host.querySelector('#classSearch');
    this.status = this.host.querySelector('#classStatus');
    this.level = this.host.querySelector('#classLevel');
    this.sort = this.host.querySelector('#classSort');
    this.host.querySelector('#clearClassFilters').onclick = () => this.reset();
    this.search.oninput = () => this.refresh();
    [this.status, this.level, this.sort].forEach((el) => { el.onchange = () => this.refresh(); });
    this.host.querySelectorAll('[data-view]').forEach((b) => { b.onclick = () => { this.view = b.dataset.view; this.render(); }; });
    document.getElementById('classPagination').onclick = (e) => {
      const b = e.target.closest('[data-page]');
      if (!b || b.disabled) return;
      this.page = Number(b.dataset.page);
      this.render();
      document.getElementById('classes').scrollIntoView({ block: 'start', behavior: 'smooth' });
    };
  }
  refresh() { this.page = 1; this.render(); }
  reset() { this.search.value = ''; this.status.value = 'all'; this.level.value = ''; this.refresh(); this.search.focus(); }
  setItems(items) {
    this.items = items;
    const value = this.level.value;
    this.level.innerHTML = '<option value="">Tất cả trình độ</option>' + [...new Set(items.map((c) => c.level).filter(Boolean))].sort().map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join('');
    this.level.value = [...this.level.options].some((o) => o.value === value) ? value : '';
    this.render();
  }
  render() {
    const normalize = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
    const query = normalize(this.search.value.trim());
    this.host.querySelector('#clearClassFilters').hidden = !query && this.status.value === 'all' && !this.level.value;
    const filtered = this.items.filter((c) => {
      if (query && !normalize([c.name, c.code, c.teacher, c.description].join(' ')).includes(query)) return false;
      if (this.level.value && c.level !== this.level.value) return false;
      if (this.status.value === 'live') return !!c.live && (this.role === 'teacher' || c.status === 'member');
      if (this.status.value === 'pending') return this.role === 'teacher' ? c.pending.length > 0 : c.status === 'pending';
      if (this.status.value === 'idle') return !c.live;
      if (this.status.value === 'member') return c.status === 'member';
      return true;
    });
    const count = (c) => this.role === 'teacher' ? c.students.length : c.studentCount;
    filtered.sort((a, b) => (this.sort.value === 'priority' ? Number(!!b.live) - Number(!!a.live) : this.sort.value === 'students' ? count(b) - count(a) : 0) || a.name.localeCompare(b.name, 'vi') || a.id.localeCompare(b.id));
    const pages = Math.max(1, Math.ceil(filtered.length / this.size));
    this.page = Math.min(this.page, pages);
    const start = (this.page - 1) * this.size;
    this.host.querySelector('#classResult').textContent = filtered.length ? `${start + 1}–${Math.min(start + this.size, filtered.length)} / ${filtered.length} lớp${filtered.length !== this.items.length ? ` (tổng ${this.items.length})` : ''}` : `0 / ${this.items.length} lớp`;
    this.host.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === this.view)));
    const grid = document.getElementById('classGrid');
    grid.className = `class-catalog ${this.view}-view`;
    this.onRender(filtered.slice(start, start + this.size));
    if (this.items.length && !filtered.length) {
      grid.innerHTML = '<div class="card empty catalog-empty"><div class="emoji">🔎</div><b>Không tìm thấy lớp phù hợp</b>Thử tên lớp khác hoặc bỏ bớt bộ lọc.<br /><br /><button class="btn btn-outline" id="resetClassFilters">Hiện tất cả lớp</button></div>';
      grid.querySelector('button').onclick = () => this.reset();
    }
    document.getElementById('classPagination').innerHTML = pages > 1 ? `
      <span>Trang ${this.page} / ${pages} · ${this.size} lớp mỗi trang</span>
      <div><button class="btn btn-outline btn-sm" data-page="${this.page - 1}" ${this.page === 1 ? 'disabled' : ''}>Trước</button>
      <label>Đến trang <select class="input" id="classPageSelect" aria-label="Chọn trang">${Array.from({ length: pages }, (_, i) => `<option value="${i + 1}" ${i + 1 === this.page ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></label>
      <button class="btn btn-outline btn-sm" data-page="${this.page + 1}" ${this.page === pages ? 'disabled' : ''}>Sau</button></div>` : '';
    const select = document.getElementById('classPageSelect');
    if (select) select.onchange = () => { this.page = Number(select.value); this.render(); document.getElementById('classes').scrollIntoView({ block: 'start' }); };
    icons();
  }
}

// ----- Thẻ lớp dùng chung (học sinh + giáo viên): ngày giờ dễ đọc, ô số liệu, thanh tiến độ -----
const ClassTile = {
  when(ts) {
    if (!ts) return '';
    const d = new Date(ts), now = new Date(), day = 86400000;
    const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((start(d) - start(now)) / day);
    const hm = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    if (diff === 0) return 'Hôm nay ' + hm;
    if (diff === 1) return 'Ngày mai ' + hm;
    if (diff === -1) return 'Hôm qua ' + hm;
    const wd = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()];
    return `${wd} ${d.getDate()}/${d.getMonth() + 1} · ${hm}`;
  },
  // Chỉ ngày (không giờ): Hôm nay / Hôm qua / T2 4/11
  day(ts) { return ClassTile.when(ts).replace(/^(Hôm nay|Ngày mai|Hôm qua) .*$/, '$1').replace(/ · .*$/, ''); },
  stat(icon, value, label, tone = '', attrs = '') {
    return `<div class="cs ${tone}" ${attrs}><span class="cs-ic"><i data-lucide="${icon}"></i></span><div><b>${value}</b><small>${label}</small></div></div>`;
  },
  bar(label, done, total) {
    const pct = total ? Math.round((done / total) * 100) : 0;
    return `<div class="ctile-progress"><div class="ctile-progress-row"><span>${label}</span><b>${done}/${total}${total ? ' · ' + pct + '%' : ''}</b></div><div class="ctile-bar"><i style="width:${pct}%"></i></div></div>`;
  },
  next(n, liveTitle) {
    if (liveTitle) return `<div class="ctile-next live"><i data-lucide="radio"></i><span>Đang live: <b>${esc(liveTitle)}</b></span></div>`;
    return n ? `<div class="ctile-next"><i data-lucide="calendar-clock"></i><span>Buổi tới: <b>${esc(ClassTile.when(n.startsAt))}</b>${n.title ? ' · ' + esc(n.title) : ''}</span></div>`
      : '<div class="ctile-next muted"><i data-lucide="calendar-x"></i><span>Chưa có lịch học sắp tới</span></div>';
  },
};
