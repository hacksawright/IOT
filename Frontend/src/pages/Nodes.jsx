import { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw, Pencil, ShieldOff, Router, X, Save } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import * as nodesApi from '../api/nodes.api';
import { getSocket } from '../api/socket';
import '../styles/admin.css';

function NodeDialog({ initial, onClose, onSave }) {
  const [form,setForm]=useState({nodeCode:initial?.nodeCode||'',name:initial?.name||'',firmwareVersion:initial?.firmwareVersion||'',hardwareVersion:initial?.hardwareVersion||'',heartbeatTimeoutSec:initial?.heartbeatTimeoutSec||60});
  const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  const set=(k,v)=>setForm((s)=>({...s,[k]:v}));
  const submit=async(e)=>{e.preventDefault();setBusy(true);setError('');try{await onSave(form);onClose();}catch(err){setError(err.message||'Không lưu được Node');}finally{setBusy(false);}};
  return <div className="modal-backdrop" onMouseDown={(e)=>{if(e.target===e.currentTarget)onClose();}}><form className="modal-card" onSubmit={submit}>
    <div className="modal-heading"><div><h2>{initial?'Cập nhật Node ESP32':'Thêm Node ESP32'}</h2><p>Quản lý định danh MQTT, firmware và thời gian heartbeat</p></div><button type="button" className="icon-button" onClick={onClose}><X size={18}/></button></div>
    <div className="form-grid"><label>Mã Node<input required disabled={Boolean(initial)} value={form.nodeCode} onChange={(e)=>set('nodeCode',e.target.value)} placeholder="NODE-01"/></label><label>Tên Node<input required value={form.name} onChange={(e)=>set('name',e.target.value)} placeholder="Gateway khu A"/></label><label>Firmware<input value={form.firmwareVersion} onChange={(e)=>set('firmwareVersion',e.target.value)} placeholder="v1.0.0"/></label><label>Hardware<input value={form.hardwareVersion} onChange={(e)=>set('hardwareVersion',e.target.value)} placeholder="ESP32-WROOM"/></label><label className="form-span-2">Timeout heartbeat (giây)<input type="number" min="1" max="3600" required value={form.heartbeatTimeoutSec} onChange={(e)=>set('heartbeatTimeoutSec',e.target.value)}/></label></div>
    {error&&<div className="notice notice--error">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Hủy</button><button className="primary-button" disabled={busy}><Save size={15}/>{busy?'Đang lưu…':'Lưu Node'}</button></div>
  </form></div>;
}
export default function Nodes(){
  const [nodes,setNodes]=useState([]);const [dialog,setDialog]=useState(false);const [notice,setNotice]=useState('');const [error,setError]=useState('');const [loading,setLoading]=useState(true);
  const load=useCallback(async()=>{setLoading(true);try{const r=await nodesApi.list();setNodes(r.data||[]);setError('');}catch(e){setError(e.message||'Không tải được Node');}finally{setLoading(false);}},[]);
  useEffect(()=>{load();},[load]);
  useEffect(()=>{const socket=getSocket();const refresh=()=>load();socket.on('node:status',refresh);return()=>socket.off('node:status',refresh);},[load]);
  const save=async(form)=>{if(dialog)await nodesApi.update(dialog.id,{name:form.name,firmwareVersion:form.firmwareVersion||null,hardwareVersion:form.hardwareVersion||null,heartbeatTimeoutSec:Number(form.heartbeatTimeoutSec)});else await nodesApi.create({...form,heartbeatTimeoutSec:Number(form.heartbeatTimeoutSec)});setNotice(dialog?'Đã cập nhật Node.':'Đã tạo Node.');await load();};
  const revoke=async(node)=>{if(!window.confirm(`Thu hồi kết nối của ${node.nodeCode}?`))return;try{await nodesApi.revoke(node.id);setNotice(`Đã thu hồi ${node.nodeCode}.`);await load();}catch(e){setError(e.message||'Không thu hồi được Node');}};
  return <div className="entity-page"><PageHeader title="Quản Lý Node ESP32" subtitle={`${nodes.length} Node — trạng thái kết nối và heartbeat`}><button className="secondary-button" onClick={load}><RefreshCw size={14}/> Làm mới</button><button className="primary-button" onClick={()=>setDialog(null)}><Plus size={16}/> Thêm Node</button></PageHeader>
    {notice&&<div className="notice notice--success">{notice}<button onClick={()=>setNotice('')}>×</button></div>}{error&&<div className="notice notice--error">{error}<button onClick={()=>setError('')}>×</button></div>}
    <div className="table-wrap"><table className="data-table"><thead><tr><th>Node</th><th>Trạng thái MQTT</th><th>Firmware / Hardware</th><th>Heartbeat cuối</th><th>Timeout</th><th>Thiết bị</th><th>Thao tác</th></tr></thead><tbody>{nodes.map((n)=><tr key={n.id}><td><div className="user-name-cell"><span className="node-symbol"><Router size={17}/></span><div><strong>{n.name}</strong><small>{n.nodeCode}</small></div></div></td><td><span className={`status-badge ${n.isRevoked?'status-badge--off':n.isOnline?'status-badge--ok':'status-badge--warn'}`}>{n.isRevoked?'Đã thu hồi':n.isOnline?'Trực tuyến':'Ngoại tuyến'}</span></td><td>{n.firmwareVersion||'—'}<small className="table-sub">{n.hardwareVersion||'Chưa rõ hardware'}</small></td><td>{n.lastHeartbeatAt?new Date(n.lastHeartbeatAt).toLocaleString('vi-VN'):'Chưa nhận heartbeat'}</td><td>{n.heartbeatTimeoutSec}s</td><td>{(n.devices||[]).length} thiết bị</td><td><div className="row-actions"><button className="icon-action" title="Sửa" onClick={()=>setDialog(n)}><Pencil size={14}/></button>{!n.isRevoked&&<button className="icon-action danger" title="Thu hồi" onClick={()=>revoke(n)}><ShieldOff size={14}/></button>}</div></td></tr>)}</tbody></table>{loading&&<div className="empty-state">Đang tải Node…</div>}{!loading&&!nodes.length&&<div className="empty-state">Chưa có Node. Thêm Node ESP32 để gán thiết bị và nhận MQTT.</div>}</div>
    {dialog!==false&&<NodeDialog key={dialog?.id||'new'} initial={dialog||null} onClose={()=>setDialog(false)} onSave={save}/>}
  </div>;
}
