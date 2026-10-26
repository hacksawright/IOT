import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, Shield, Wrench, Users as UsersIcon, Cpu, Plus, Pencil, Trash2, X, Save, RefreshCw } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../auth/AuthContext';
import * as usersApi from '../api/users.api';
import * as devicesApi from '../api/devices.api';
import '../styles/admin.css';

const ROLE = {
  admin: { label: 'Admin', color: 'cyan', icon: Shield, caption: 'Toàn quyền hệ thống' },
  operator: { label: 'Operator', color: 'amber', icon: Wrench, caption: 'Vận hành thiết bị' },
  viewer: { label: 'Viewer', color: 'muted', icon: Eye, caption: 'Chỉ xem' },
};
const RIGHTS = [
  ['Xem Dashboard', true, true, true], ['Xem danh sách thiết bị', true, true, true],
  ['Thay đổi vòng đời thiết bị', true, true, false], ['Thêm / khóa thiết bị', true, false, false],
  ['Điều khiển thiết bị & cấu hình', true, true, false], ['Xác nhận / xử lý cảnh báo', true, true, false],
  ['Xem AI chẩn đoán', true, true, true], ['Quản lý người dùng / Node', true, false, false], ['Xem Audit Log', true, false, false],
];
const labelDevice = (d) => d?.name || d?.deviceCode || `Thiết bị #${d?.id}`;
const when = (v) => v ? new Date(v).toLocaleString('vi-VN') : 'Chưa đăng nhập';

function UserDialog({ initial, onClose, onSave }) {
  const [form, setForm] = useState({ username: initial?.username || '', fullName: initial?.fullName || '', email: initial?.email || '', role: initial?.role || 'viewer', password: '', isActive: initial?.isActive ?? true });
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const change = (key, value) => setForm((old) => ({ ...old, [key]: value }));
  const submit = async (e) => { e.preventDefault(); setBusy(true); setError(''); try { await onSave(form); onClose(); } catch (err) { setError(err.message || 'Không lưu được tài khoản'); } finally { setBusy(false); } };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><form className="modal-card" onSubmit={submit}>
    <div className="modal-heading"><div><h2>{initial ? 'Sửa tài khoản' : 'Thêm người dùng'}</h2><p>{initial ? `Cập nhật ${initial.username}` : 'Tạo tài khoản và cấp vai trò RBAC'}</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Đóng"><X size={18}/></button></div>
    <div className="form-grid">
      <label>Tên đăng nhập<input value={form.username} disabled={Boolean(initial)} required onChange={(e)=>change('username',e.target.value)} placeholder="nguyenvana"/></label>
      <label>Họ và tên<input value={form.fullName} required onChange={(e)=>change('fullName',e.target.value)} placeholder="Nguyễn Văn An"/></label>
      <label>Email<input type="email" value={form.email} required onChange={(e)=>change('email',e.target.value)} placeholder="user@iot.vn"/></label>
      <label>Vai trò<select value={form.role} onChange={(e)=>change('role',e.target.value)}><option value="admin">Admin</option><option value="operator">Operator</option><option value="viewer">Viewer</option></select></label>
      <label className="form-span-2">{initial ? 'Mật khẩu mới (để trống nếu không đổi)' : 'Mật khẩu (tối thiểu 8 ký tự)'}<input type="password" minLength={initial ? 0 : 8} autoComplete="new-password" value={form.password} required={!initial} onChange={(e)=>change('password',e.target.value)} placeholder={initial ? '••••••••' : 'Nhập mật khẩu'}/></label>
      {initial && <label className="checkbox-label form-span-2"><input type="checkbox" checked={form.isActive} onChange={(e)=>change('isActive',e.target.checked)}/> Tài khoản đang hoạt động</label>}
    </div>
    {error && <div className="notice notice--error">{error}</div>}
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Hủy</button><button className="primary-button" disabled={busy}><Save size={15}/>{busy ? 'Đang lưu…' : 'Lưu tài khoản'}</button></div>
  </form></div>;
}

export default function Users() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]); const [devices, setDevices] = useState([]);
  const [view, setView] = useState('users'); const [selected, setSelected] = useState(null);
  const [dialog, setDialog] = useState(false); const [assignment, setAssignment] = useState([]);
  const [query, setQuery] = useState(''); const [notice, setNotice] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [savingAssignment, setSavingAssignment] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [userRes, deviceRes] = await Promise.all([usersApi.list({ limit: 100 }), devicesApi.list({ limit: 100 })]);
      setUsers(userRes.data || []); setDevices(deviceRes.data || []);
    } catch (e) { setError(e.message || 'Không tải được dữ liệu người dùng'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const found = users.find((u) => String(u.id) === String(selected)); if (found) setAssignment(found.role === 'admin' ? devices.map((d) => d.id) : (found.devices || []).map((d) => d.id)); }, [selected, users, devices]);
  const counts = useMemo(() => ({ admin: users.filter((u)=>u.role==='admin').length, operator: users.filter((u)=>u.role==='operator').length, viewer: users.filter((u)=>u.role==='viewer').length }), [users]);
  const filtered = useMemo(() => users.filter((u) => `${u.fullName} ${u.username} ${u.email}`.toLowerCase().includes(query.toLowerCase())), [users, query]);
  const selectedUser = users.find((u) => String(u.id) === String(selected));
  const saveUser = async (form) => {
    const payload = { fullName: form.fullName, email: form.email, role: form.role };
    if (!dialog) { payload.username = form.username; payload.password = form.password; await usersApi.create(payload); setNotice('Đã tạo tài khoản.'); }
    else { if (form.password) payload.password = form.password; payload.isActive = form.isActive; await usersApi.update(dialog.id, payload); setNotice('Đã cập nhật tài khoản.'); }
    await load();
  };
  const deactivate = async (u) => {
    if (String(u.id) === String(currentUser?.id)) { setError('Bạn không thể tự khóa tài khoản của mình.'); return; }
    if (!window.confirm(`Khóa tài khoản ${u.fullName}?`)) return;
    try { if (u.isActive) await usersApi.deactivate(u.id); else await usersApi.update(u.id, { isActive: true }); setNotice(u.isActive ? 'Đã khóa tài khoản.' : 'Đã kích hoạt tài khoản.'); await load(); }
    catch(e) { setError(e.message || 'Không cập nhật được trạng thái tài khoản'); }
  };
  const saveAssignments = async () => {
    if (!selectedUser || selectedUser.role === 'admin') return;
    setSavingAssignment(true); setError('');
    try { await usersApi.assignDevices(selectedUser.id, assignment.map(Number)); setNotice('Đã cập nhật thiết bị được gán.'); await load(); }
    catch(e) { setError(e.message || 'Không lưu được phân quyền thiết bị'); }
    finally { setSavingAssignment(false); }
  };
  const isAssigned = (u, d) => u.role === 'admin' || (u.devices || []).some((x) => Number(x.id) === Number(d.id));

  return <div className="entity-page users-page">
    <PageHeader title="Quản Lý Người Dùng" subtitle={`${users.length} tài khoản — RBAC 3 vai trò`}><button className="primary-button" onClick={()=>setDialog(null)}><Plus size={16}/> Thêm người dùng</button></PageHeader>
    {notice && <div className="notice notice--success">{notice}<button onClick={()=>setNotice('')} aria-label="Đóng">×</button></div>}{error && <div className="notice notice--error">{error}<button onClick={()=>setError('')} aria-label="Đóng">×</button></div>}
    <section className="role-summary">{Object.entries(ROLE).map(([key, role]) => { const Icon = role.icon; return <article className={`role-card role-card--${role.color}`} key={key}><div className="role-card__title"><span><Icon size={18}/></span><strong>{role.label}</strong></div><b>{counts[key]}</b><small>{role.caption}</small></article>; })}</section>
    <section className={`entity-workspace ${selectedUser && view==='users' ? 'with-side-panel' : ''}`}>
      <div className="entity-content">
        <div className="toolbar"><div className="segmented-control"><button className={view==='users'?'active':''} onClick={()=>{setView('users');setSelected(null);}}><UsersIcon size={14}/> Theo người dùng</button><button className={view==='devices'?'active':''} onClick={()=>{setView('devices');setSelected(null);}}><Cpu size={14}/> Theo thiết bị</button></div><input className="table-search" value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Tìm người dùng…"/><button className="secondary-button" onClick={load} title="Làm mới"><RefreshCw size={14}/></button></div>
        {loading ? <div className="empty-state">Đang tải tài khoản…</div> : view==='users' ? <div className="table-wrap"><table className="data-table users-table"><thead><tr><th>Người dùng</th><th>Email</th><th>Vai trò</th><th>Thiết bị được gán</th><th>Trạng thái</th><th>Đăng nhập lần cuối</th><th></th></tr></thead><tbody>{filtered.map((u) => <tr key={u.id} className={String(selected)===String(u.id)?'selected-row':''} onClick={()=>setSelected(u.id)}><td><div className="user-name-cell"><span className={`user-avatar user-avatar--${ROLE[u.role]?.color||'muted'}`}>{(u.fullName||u.username||'?').slice(0,1).toUpperCase()}</span><div><strong>{u.fullName}</strong><small>@{u.username}</small></div></div></td><td className="mono-cell">{u.email}</td><td><span className={`role-text role-text--${ROLE[u.role]?.color||'muted'}`}><span>◆</span> {ROLE[u.role]?.label||u.role}</span></td><td><div className="device-tags">{u.role==='admin' ? <span className="tag">Tất cả ({devices.length})</span> : (u.devices||[]).slice(0,2).map((d)=> <span className="tag" key={d.id}>{labelDevice(d)}</span>)}{u.role!=='admin'&&(u.devices||[]).length>2&&<span className="tag tag--more">+{u.devices.length-2}</span>}{u.role!=='admin'&&!(u.devices||[]).length&&<span className="muted-text">Chưa gán</span>}</div></td><td><span className={`status-badge ${u.isActive?'status-badge--ok':'status-badge--off'}`}>{u.isActive?'Hoạt động':'Không hoạt động'}</span></td><td>{when(u.lastLoginAt)}</td><td><div className="row-actions" onClick={(e)=>e.stopPropagation()}><button className="icon-action" title="Sửa" onClick={()=>setDialog(u)}><Pencil size={14}/></button><button className={`icon-action ${u.isActive?'danger':''}`} title={u.isActive?'Khóa tài khoản':'Kích hoạt lại'} onClick={()=>deactivate(u)} disabled={String(u.id)===String(currentUser?.id)}><Trash2 size={14}/></button></div></td></tr>)}</tbody></table>{!filtered.length&&<div className="empty-state">Không có người dùng phù hợp.</div>}</div> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Thiết bị</th><th>Loại</th><th>Người được gán</th></tr></thead><tbody>{devices.map((d)=> <tr key={d.id}><td><strong>{labelDevice(d)}</strong><small className="table-sub">{d.deviceCode}</small></td><td>{d.type==='PUMP'?'Bơm nước':d.type==='SENSOR'?'Cảm biến':d.type}</td><td><div className="device-tags">{users.filter((u)=>isAssigned(u,d)).map((u)=><span className={`tag tag--${ROLE[u.role]?.color||'muted'}`} key={u.id}>{u.fullName}</span>)}{!users.some((u)=>isAssigned(u,d))&&<span className="muted-text">Chưa gán người dùng</span>}</div></td></tr>)}</tbody></table>{!devices.length&&<div className="empty-state">Chưa có thiết bị.</div>}</div>}
      </div>
      {selectedUser && view==='users' && <aside className="side-detail"><div className="side-detail__heading"><div><h2>{selectedUser.fullName}</h2><p>{selectedUser.email}</p></div><button className="icon-button" onClick={()=>setSelected(null)} aria-label="Đóng"><X size={16}/></button></div><p className="detail-description">{selectedUser.role==='admin'?'Admin có quyền trên tất cả thiết bị.':'Chọn các thiết bị mà tài khoản này được quyền xem và vận hành theo vai trò.'}</p><div className="assignment-list">{devices.map((d)=> <label key={d.id} className={`assignment-item ${selectedUser.role==='admin'?'is-readonly':''}`}><input type="checkbox" checked={assignment.includes(d.id)} disabled={selectedUser.role==='admin'} onChange={(e)=>setAssignment((old)=>e.target.checked?[...old,d.id]:old.filter((id)=>id!==d.id))}/><span>{labelDevice(d)}<small>{d.deviceCode}</small></span></label>)}</div>{selectedUser.role==='admin'?<div className="notice">Tài khoản Admin mặc định có toàn quyền; danh sách gán không giới hạn quyền truy cập.</div>:<button className="primary-button full-width" onClick={saveAssignments} disabled={savingAssignment}><Save size={14}/>{savingAssignment?'Đang lưu…':'Lưu thiết bị được gán'}</button>}</aside>}
    </section>
    <section className="rbac-card"><h2>Ma Trận Phân Quyền RBAC</h2><table className="rbac-table"><thead><tr><th>Chức năng</th><th className="role-text--cyan">Admin</th><th className="role-text--amber">Operator</th><th>Viewer</th></tr></thead><tbody>{RIGHTS.map(([name,...allowed])=><tr key={name}><td>{name}</td>{allowed.map((ok,i)=><td key={i} className={ok?'permission-yes':'permission-no'}>{ok?'✓':'×'}</td>)}</tr>)}</tbody></table></section>
    {dialog!==false && dialog!==undefined && <UserDialog key={dialog?.id || 'new'} initial={dialog || null} onClose={()=>setDialog(false)} onSave={saveUser}/>}
  </div>;
}
