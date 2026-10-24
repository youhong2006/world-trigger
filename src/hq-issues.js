// Reports are local observations, not automatically verified rendering defects.
export const HQ_ISSUE_KEY = 'mikado-hq-visual-issues-v1';
export const HQ_ISSUE_STATUSES = Object.freeze({ reported: '待核對', confirmed: '已確認', fixed: '已修復' });
export const HQ_KNOWN_ISSUES = Object.freeze([]);

export function createHQIssueLog(storage) {
  let records = [];
  const normalize = (record) => {
    const p = record?.position;
    if (!p || ![p.x, p.y, p.z].every(Number.isFinite)) return null;
    return {
      id: String(record.id ?? '').slice(0, 64),
      title: String(record.title ?? '畫面問題').slice(0, 160),
      note: String(record.note ?? '').slice(0, 1500),
      floor: String(record.floor ?? '').slice(0, 16),
      wing: String(record.wing ?? '').slice(0, 24),
      position: { x: p.x, y: p.y, z: p.z },
      status: Object.hasOwn(HQ_ISSUE_STATUSES, record.status) ? record.status : 'reported',
      created: String(record.created ?? '').slice(0, 40),
    };
  };
  try {
    const saved = JSON.parse(storage?.getItem(HQ_ISSUE_KEY) ?? '[]');
    if (Array.isArray(saved)) records = saved.slice(-200).map(normalize).filter(Boolean);
  } catch {}
  const save = () => {
    try {
      storage?.setItem(HQ_ISSUE_KEY, JSON.stringify(records));
    } catch {}
  };
  return {
    add({ position, floor, wing, note, title = '玩家畫面回報' }) {
      const now = new Date(),
        id = `ISS-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const record = normalize({
        id,
        position,
        floor,
        wing,
        note,
        title,
        status: 'reported',
        created: now.toISOString(),
      });
      if (!record) return null;
      records.push(record);
      records = records.slice(-200);
      save();
      return { ...record, position: { ...record.position } };
    },
    setStatus(id, status) {
      if (!Object.hasOwn(HQ_ISSUE_STATUSES, status)) return false;
      const record = records.find((r) => r.id === id);
      if (!record) return false;
      record.status = status;
      save();
      return true;
    },
    remove(id) {
      records = records.filter((r) => r.id !== id);
      save();
    },
    get records() {
      return [...HQ_KNOWN_ISSUES, ...records].map((r) => ({ ...r, position: { ...r.position } }));
    },
    export() {
      return JSON.stringify({ version: 1, kind: 'hq-visual-observations', records: this.records }, null, 2);
    },
  };
}
