import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import * as auditApi from '../api/auditLogs.api';
import '../styles/admin.css';
export default function Audit(){
 const [rows,setRows]=useState([]);const [filters,setFilters]=useState({action:'',entityType:'',success:''});const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [page,setPage]=useState(1);const [meta,setMeta]=useState(null);
 const load=useCallback(async()=>{setLoading(true);try{const r=await auditApi.list({...filters,page,limit:50});setRows(r.data||[]);setMeta(r.meta||null);setError('');}catch(e){setError(e.message||'Không tải được Audit Log');}finally{setLoading(false);}},[filters,page]);
 useEffect(()=>{load();},[load]);
 const set=(k,v)=>{setFilters((old)=>({...old,[k]:v}));setPage(1);};
 return <div className="entity-page"><PageHeader title="Audit Log" subtitle="Nhật ký thao tác, kết quả và sự kiện bảo mật"><button className="secondary-button" onClick={load}><RefreshCw size={14}/> Làm mới</button></PageHeader>
 {error&&<div className="notice notice--error">{error}</div>}
 <div className="filter-bar"><label>Hành động<input value={filters.action} onChange={(e)=>set('action',e.target.value)} placeholder="auth.login, device.command…"/></label><label>Loại đối tượng<select value={filters.entityType} onChange={(e)=>set('entityType',e.target.value)}><option value="">Tất cả</option>{['user','device','node','alert','leafAnalysis','auth'].map(x=><option key={x}>{x}</option>)}</select></label><label>Kết quả<select value={filters.success} onChange={(e)=>set('success',e.target.value)}><option value="">Tất cả</option><option value="true">Thành công</option><option value="false">Thất bại</option></select></label><span className="filter-count">{meta?.total ?? rows.length} bản ghi</span></div>
 <div className="table-wrap"><table className="data-table audit-table"><thead><tr><th>Thời gian</th><th>Người dùng</th><th>Hành động</th><th>Đối tượng</th><th>Kết quả</th><th>Chi tiết</th></tr></thead><tbody>{rows.map((a)=><tr key={a.id}><td>{a.createdAt?new Date(a.createdAt).toLocaleString('vi-VN'):'—'}</td><td><strong>{a.user?.username||'Hệ thống'}</strong><small className="table-sub">{a.user?.role||'system'}</small></td><td><code>{a.action}</code></td><td>{a.entityType||'—'}{a.entityId?` #${a.entityId}`:''}</td><td><span className={`status-badge ${a.success===false?'status-badge--off':'status-badge--ok'}`}>{a.success===false?'Thất bại':'Thành công'}</span></td><td><details className="audit-detail"><summary>Chi tiết</summary><pre>{JSON.stringify(a.detail||{},null,2)}</pre></details></td></tr>)}</tbody></table>{loading&&<div className="empty-state">Đang tải nhật ký…</div>}{!loading&&!rows.length&&<div className="empty-state"><ShieldCheck size={24}/>Chưa có bản ghi Audit Log.</div>}</div>
 <div className="pagination"><span>Trang {meta?.page||page} · {meta?.total??rows.length} bản ghi</span><div><button className="secondary-button" disabled={page<=1} onClick={()=>setPage((p)=>p-1)}>Trước</button><button className="secondary-button" disabled={meta?.pages? page>=meta.pages: rows.length<50} onClick={()=>setPage((p)=>p+1)}>Sau</button></div></div>
 </div>;
}
