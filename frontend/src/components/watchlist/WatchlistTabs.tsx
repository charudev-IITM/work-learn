import React, { useRef, useEffect, useState } from 'react';
import { MoreHorizontal, Plus } from 'lucide-react';
import { useWatchlist } from '../../contexts/WatchlistContext';
import { WatchlistEditModal } from './WatchlistEditModal';
import { cn } from '../../lib/cn';

export function WatchlistTabs() {
  const {
    watchlists,
    currentWatchlistId,
    setCurrentWatchlist,
    createWatchlist,
    deleteWatchlist,
    renameWatchlist,
    swipeToWatchlist,
  } = useWatchlist();

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingWatchlist, setEditingWatchlist] = useState<{ id: string; name: string } | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef({
    startX: 0,
    startTime: 0,
    isDragging: false,
  });

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchRef.current = { startX: touch.clientX, startTime: Date.now(), isDragging: false };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchRef.current.startX) return;
    const deltaX = Math.abs(e.touches[0].clientX - touchRef.current.startX);
    if (deltaX > 10) touchRef.current.isDragging = true;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchRef.current.isDragging) return;
    const deltaX = e.changedTouches[0].clientX - touchRef.current.startX;
    const deltaTime = Date.now() - touchRef.current.startTime;
    if (Math.abs(deltaX) > 50 && deltaTime < 500) {
      swipeToWatchlist(deltaX > 0 ? 'right' : 'left');
    }
    touchRef.current = { startX: 0, startTime: 0, isDragging: false };
  };

  useEffect(() => {
    if (tabsRef.current) {
      const el = tabsRef.current.querySelector(`[data-tab-id="${currentWatchlistId}"]`) as HTMLElement;
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [currentWatchlistId]);

  const handleStartEdit = (watchlist: { id: string; name: string }) => {
    setEditingWatchlist(watchlist);
    setEditModalOpen(true);
  };

  const handleSaveEdit = (newName: string) => {
    if (editingWatchlist) renameWatchlist(editingWatchlist.id, newName);
    setEditModalOpen(false);
    setEditingWatchlist(null);
  };

  const handleDeleteWatchlist = () => {
    if (editingWatchlist) {
      deleteWatchlist(editingWatchlist.id);
    }
    setEditModalOpen(false);
    setEditingWatchlist(null);
  };

  const handleCreateWatchlist = (name: string) => {
    createWatchlist(name);
    setCreateModalOpen(false);
  };

  // Only allow deleting non-current watchlists (and must have more than 1)
  const canDeleteEditing = editingWatchlist
    && watchlists.length > 1
    && editingWatchlist.id !== currentWatchlistId;

  return (
    <>
      <div className="border-t border-border/30 bg-background/95 backdrop-blur-sm">
          <div
            ref={tabsRef}
            data-coach="watchlist-tabs"
            className="flex overflow-x-auto no-scrollbar px-4 py-2 pb-safe"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {watchlists.map((watchlist) => {
              const isActive = currentWatchlistId === watchlist.id;

              return (
                <div
                  key={watchlist.id}
                  data-tab-id={watchlist.id}
                  className="relative mx-1 shrink-0 group"
                  style={{ padding: '2px' }}
                >

                  <button
                    onClick={() => setCurrentWatchlist(watchlist.id)}
                    className={cn(
                      'relative flex items-center h-9 px-3 rounded-full',
                      'active:scale-95',
                      isActive
                        ? 'bg-primary/15 border border-primary/30 shadow-sm shadow-primary/10'
                        : 'bg-muted/50 border border-muted hover:border-muted-foreground/20',
                      'backdrop-blur-sm'
                    )}
                  >
                    <span className={cn(
                      'text-xs font-semibold whitespace-nowrap max-w-28 truncate',
                      isActive ? 'text-primary font-bold' : 'text-muted-foreground',
                    )}>
                      {watchlist.name}
                    </span>
                  </button>

                  <button
                    onClick={() => handleStartEdit(watchlist)}
                    className={cn(
                      'absolute -bottom-1 -right-1 w-5 h-5 rounded-full',
                      'bg-background border border-border shadow-sm',
                      'hover:bg-muted active:scale-90',
                      'opacity-0 group-hover:opacity-100',
                      'flex items-center justify-center'
                    )}
                  >
                    <MoreHorizontal className="w-3 h-3 text-muted-foreground" />
                  </button>
                </div>
              );
            })}

            {/* Create new watchlist button */}
            {watchlists.length < 5 && (
              <div className="mx-1 shrink-0" style={{ padding: '2px' }}>
                <button
                  onClick={() => setCreateModalOpen(true)}
                  className={cn(
                    'flex items-center gap-1 h-9 px-3 rounded-full',
                    'border-2 border-dashed border-muted-foreground/30 hover:border-primary/50',
                    'hover:bg-primary/5 active:scale-95',
                  )}
                >
                  <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-medium">New</span>
                </button>
              </div>
            )}

            <div className="w-4 shrink-0" />
          </div>
      </div>

      {/* Edit Modal (with delete for non-active watchlists) */}
      <WatchlistEditModal
        isOpen={editModalOpen}
        onClose={() => { setEditModalOpen(false); setEditingWatchlist(null); }}
        currentName={editingWatchlist?.name || ''}
        onSave={handleSaveEdit}
        onDelete={canDeleteEditing ? handleDeleteWatchlist : undefined}
      />

      {/* Create Modal */}
      <WatchlistEditModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        currentName=""
        onSave={handleCreateWatchlist}
        title="Create Watchlist"
        placeholder="Watchlist name"
      />
    </>
  );
}
