import React, { useState, useEffect } from 'react';
import { DndContext, closestCenter, DragOverlay, useSensor, useSensors, MouseSensor, TouchSensor } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import './AdminBoardPage.css';

// -------------------------------------------------------------
// Sortable Item Component
// -------------------------------------------------------------
function SortableItem({ item }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const fields = item.fields || {};
  
  const name = fields['XHS_ID'] || fields['INFL_ID'] || '이름 없음';
  
  const hasLink = Boolean(fields['XHS_Result'] || fields['DP_Result'] || fields['보고서_URL'] || fields['인플전용링크']);
  const linkStatus = hasLink ? '🔗 링크 O' : '⏳ 미등록';
  const linkColor = hasLink ? '#38a169' : '#e53e3e';
  
  const submitStatus = fields['제출상태'] || '상태 없음';
  const xhsLink = fields['XHS_Result'] || (fields['XHS_link1 (from WC_ID_)'] ? fields['XHS_link1 (from WC_ID_)'][0] : null);

  const origMonth = fields['(원)정산월'];
  const origType = fields['(원)유형'];
  
  const isModified = Boolean(origMonth !== fields['정산월'] || origType !== fields['유형']);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`admin-item-card ${isDragging ? 'dragging' : ''} ${isModified ? 'modified' : ''}`}
      {...attributes}
      {...listeners}
    >
      <div className="card-title">
        {name}
        <span style={{ fontSize: 11, fontWeight: 'normal', color: '#718096', marginLeft: 6 }}>
          (원) {origMonth}
        </span>
      </div>
      
      {isModified && (
        <div style={{ fontSize: 11, color: '#e53e3e', marginBottom: 6, fontWeight: 'bold' }}>
          🔄 변경 중: {origMonth} / {origType} → {fields['정산월']} / {fields['유형']}
        </div>
      )}

      <div className="card-meta">
        <span style={{ 
          fontWeight: 'bold', 
          color: isModified ? 'white' : 'inherit',
          backgroundColor: isModified ? '#3182ce' : 'transparent',
          padding: isModified ? '2px 6px' : '0',
          borderRadius: isModified ? '4px' : '0',
          transition: 'all 0.2s'
        }}>
          {fields['유형'] || '유형없음'}
        </span>
        <span style={{ color: linkColor, fontWeight: 'bold' }}>{linkStatus}</span>
      </div>
      <div className="card-meta" style={{ marginTop: 4, fontSize: 11, color: '#4a5568' }}>
        <span>제출상태: {submitStatus}</span>
        {xhsLink && (
          <span>
            <a 
              href={xhsLink} 
              target="_blank" 
              rel="noreferrer"
              style={{ color: '#3182ce', textDecoration: 'none' }}
              onPointerDown={(e) => e.stopPropagation()} 
            >
              XHS 링크 보기
            </a>
          </span>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Droppable Container Component
// -------------------------------------------------------------
import { useDroppable } from '@dnd-kit/core';

function DroppableGroup({ id, items, targetCount }) {
  const { setNodeRef, isOver } = useDroppable({ id });

  const visitedCount = items.length;
  const uploadCount = items.filter(i => {
    const hasLink = Boolean(i.fields['XHS_Result'] || i.fields['DP_Result'] || i.fields['보고서_URL'] || i.fields['인플전용링크']);
    return i.fields['제출상태'] === '✅' && hasLink;
  }).length;

  return (
    <div className={`swimlane-cell ${isOver ? 'is-over' : ''}`} ref={setNodeRef}>
      <div className="cell-stats">
        <span style={{fontWeight:'bold', color:'var(--revu-purple)'}}>🎯 {targetCount}</span> | 
        <span style={{fontWeight:'bold', color:'#3182ce'}}> 👤 {visitedCount}</span> | 
        <span style={{fontWeight:'bold', color:'#38a169'}}> 🔗 {uploadCount}</span>
      </div>
      <SortableContext id={id} items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
        <div className="cell-items-container">
          {items.map(item => (
            <SortableItem key={item.id} item={item} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

// -------------------------------------------------------------
// Main AdminBoard Component
// -------------------------------------------------------------
export default function AdminBoardPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [progressData, setProgressData] = useState([]);
  
  const [stores, setStores] = useState([]);
  const [allMonths, setAllMonths] = useState([]);
  
  const [selectedStore, setSelectedStore] = useState('');
  const [selectedBaseMonth, setSelectedBaseMonth] = useState('');
  
  const [loadingApp, setLoadingApp] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [activeItem, setActiveItem] = useState(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  useEffect(() => {
    async function init() {
      try {
        const res = await fetch('/api/admin-board-api?action=campaigns');
        const camps = await res.json();
        setCampaigns(camps);
        
        const storeSet = new Set();
        const monthSet = new Set();
        
        camps.forEach(c => {
          let name = c.fields['고객사명'];
          if (Array.isArray(name)) name = name[0];
          if (name && typeof name === 'string') storeSet.add(name.trim());
          
          let month = c.fields['계약월'];
          if (month && typeof month === 'string') monthSet.add(month.trim());
        });
        
        const storeList = Array.from(storeSet).sort();
        setStores(storeList);
        if (storeList.length > 0) setSelectedStore(storeList[0]);
        
        const monthList = Array.from(monthSet).sort((a, b) => {
          const matchA = a.match(/(\d{4})\.\s*(\d+)월/);
          const matchB = b.match(/(\d{4})\.\s*(\d+)월/);
          const parse = m => m ? parseInt(m[1]) * 100 + parseInt(m[2]) : 0;
          return parse(matchA) - parse(matchB);
        });
        setAllMonths(monthList);
        if (monthList.length > 0) setSelectedBaseMonth(monthList[0]);
        
      } catch (e) {
        console.error(e);
        alert("기본 데이터를 불러오는데 실패했습니다.");
      } finally {
        setLoadingApp(false);
      }
    }
    init();
  }, []);

  const handleLoadData = async () => {
    if (!selectedStore) return;
    setLoadingData(true);
    try {
      const res = await fetch(`/api/admin-board-api?action=progress&client=${encodeURIComponent(selectedStore)}`);
      const data = await res.json();
      data.forEach(p => {
        if (!p.fields['(원)정산월']) p.fields['(원)정산월'] = p.fields['정산월'];
        if (!p.fields['(원)유형']) p.fields['(원)유형'] = p.fields['유형'];
      });
      setProgressData(data);
    } catch (e) {
      alert("매장 실적 데이터를 불러오는데 실패했습니다.");
    } finally {
      setLoadingData(false);
    }
  };

  const storeCampaigns = campaigns.filter(c => {
    let name = c.fields['고객사명'];
    if (Array.isArray(name)) name = name[0];
    return name && typeof name === 'string' && name.trim() === selectedStore;
  });
  const storeCampaignIds = new Set(storeCampaigns.map(c => c.id));

  const storeProgressItems = progressData.filter(p => {
    const links = p.fields['귀속 정산월'] || [];
    return links.some(linkId => storeCampaignIds.has(linkId));
  });

  const modifiedCount = storeProgressItems.filter(p => {
    const origMonth = p.fields['(원)정산월'];
    const origType = p.fields['(원)유형'];
    return origMonth !== p.fields['정산월'] || origType !== p.fields['유형'];
  }).length;

  const getNextMonths = (baseStr, count) => {
    if (!baseStr) return [];
    const match = baseStr.match(/(\d{4})\.\s*(\d+)월/);
    if (!match) return [baseStr];
    
    let year = parseInt(match[1]);
    let month = parseInt(match[2]);
    const res = [];
    
    for (let i = 0; i < count; i++) {
      res.push(`${year}. ${month}월`);
      month++;
      if (month > 12) {
        month = 1;
        year++;
      }
    }
    return res;
  };
  
  const displayMonths = getNextMonths(selectedBaseMonth, 3);
  const types = ['인플', '체험', '기자'];

  const getItemsForGroup = (month, type) => {
    return storeProgressItems.filter(p => p.fields['정산월'] === month && p.fields['유형'] === type);
  };

  const getTargetCount = (month, type) => {
    const targetCampaign = storeCampaigns.find(c => c.fields['계약월'] === month);
    if (!targetCampaign) return 0;
    const f = targetCampaign.fields;
    if (type === '인플') return f['인플_요청'] || f['인플_목표'] || 0;
    if (type === '체험') return f['체험_목표'] || f['체험단_요청'] || 0;
    if (type === '기자') return f['기자단_요청'] || f['기자_목표'] || 0;
    return 0;
  };

  const handleDragStart = (event) => {
    const { active } = event;
    const item = storeProgressItems.find(p => p.id === active.id);
    setActiveItem(item);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveItem(null);
    if (!over) return;

    const activeId = active.id;
    let destContainerId = over.id;
    
    if (!String(destContainerId).includes('|')) {
      const overItem = storeProgressItems.find(p => p.id === destContainerId);
      if (overItem) {
        destContainerId = `${overItem.fields['정산월']}|${overItem.fields['유형']}`;
      } else {
        return;
      }
    }

    const [destMonth, destType] = destContainerId.split('|');
    const draggedItem = storeProgressItems.find(p => p.id === activeId);

    if (!draggedItem) return;
    if (draggedItem.fields['정산월'] === destMonth && draggedItem.fields['유형'] === destType) return; 

    const targetCampaign = storeCampaigns.find(c => c.fields['계약월'] === destMonth);
    const newCampaignId = targetCampaign ? targetCampaign.id : null;

    if (!newCampaignId) {
      if (!window.confirm(`선택하신 [${destMonth}]에 해당하는 캠페인 레코드가 아직 없습니다.\n그래도 변경하시겠습니까?`)) {
        return;
      }
    }

    setProgressData(prev => prev.map(p => {
      if (p.id === activeId) {
        return {
          ...p,
          fields: { ...p.fields, '정산월': destMonth, '유형': destType, '귀속 정산월': newCampaignId ? [newCampaignId] : p.fields['귀속 정산월'] }
        };
      }
      return p;
    }));
  };

  const handleConfirm = async () => {
    const updates = [];
    storeProgressItems.forEach(p => {
      const origMonth = p.fields['(원)정산월'];
      const origType = p.fields['(원)유형'];
      if (origMonth !== p.fields['정산월'] || origType !== p.fields['유형']) {
        const targetCampaign = storeCampaigns.find(c => c.fields['계약월'] === p.fields['정산월']);
        updates.push({
          id: p.id,
          newMonth: p.fields['정산월'],
          newType: p.fields['유형'],
          newCampaignId: targetCampaign ? targetCampaign.id : null
        });
      }
    });

    if (updates.length === 0) return alert("변경된 실적이 없습니다.");
    if (!window.confirm(`총 ${updates.length}개의 변경사항을 DB에 확정하시겠습니까?`)) return;

    setIsConfirming(true);
    try {
      const res = await fetch('/api/admin-board-api?action=bulk_update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates })
      });
      if (!res.ok) throw new Error("서버 에러");
      alert(`성공적으로 반영되었습니다.`);
      await handleLoadData();
    } catch (e) {
      alert("일괄 확정 중 오류가 발생했습니다.");
    } finally {
      setIsConfirming(false);
    }
  };

  if (loadingApp) {
    return <div style={{padding: 40, fontSize: 18}}>Loading Admin Board...</div>;
  }

  return (
    <div className="admin-board-container">
      <div className="admin-board-header">
        <h2 style={{margin: 0, color: 'var(--revu-purple)'}}>Gravity Admin Board</h2>
        
        <select 
          className="admin-client-select"
          value={selectedStore} 
          onChange={e => { setSelectedStore(e.target.value); setProgressData([]); }}
        >
          {stores.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        
        <select 
          className="admin-client-select"
          style={{ minWidth: '150px' }}
          value={selectedBaseMonth} 
          onChange={e => setSelectedBaseMonth(e.target.value)}
        >
          {allMonths.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        <button 
          className="admin-btn-load"
          onClick={handleLoadData} 
          disabled={loadingData}
        >
          {loadingData ? "로딩 중..." : "불러오기"}
        </button>

        <span style={{color: '#718096', fontSize: 14}}>
          총 {storeProgressItems.length}개의 실적
        </span>

        <div style={{ marginLeft: 'auto' }}>
          <button 
            className="admin-btn-confirm" 
            onClick={handleConfirm}
            disabled={modifiedCount === 0 || isConfirming}
          >
            {isConfirming ? 'DB 반영 중...' : `조정 확정 (${modifiedCount}개 변경)`}
          </button>
        </div>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} collisionDetection={closestCenter}>
        
        <div className="swimlane-board">
          {/* Header Row (Months) */}
          <div className="swimlane-row header-row">
            <div className="swimlane-type-label empty"></div>
            {displayMonths.map(month => (
              <div key={month} className="swimlane-month-header">{month}</div>
            ))}
          </div>

          {/* Data Rows (Types) */}
          {types.map(type => (
            <div key={type} className="swimlane-row data-row">
              <div className="swimlane-type-label">{type}</div>
              {displayMonths.map(month => {
                const groupId = `${month}|${type}`;
                const items = getItemsForGroup(month, type);
                const targetCount = getTargetCount(month, type);
                return (
                  <DroppableGroup 
                    key={groupId} 
                    id={groupId} 
                    items={items} 
                    targetCount={targetCount}
                  />
                );
              })}
            </div>
          ))}
        </div>

        <DragOverlay>
          {activeItem ? <SortableItem item={activeItem} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
