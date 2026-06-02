import React, { useState, useEffect } from 'react';
import { X, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

interface WatchlistEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentName: string;
  onSave: (newName: string) => void;
  onDelete?: () => void;
  title?: string;
  placeholder?: string;
}

export function WatchlistEditModal({ isOpen, onClose, currentName, onSave, onDelete, title, placeholder }: WatchlistEditModalProps) {
  const [name, setName] = useState(currentName);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    setName(currentName);
    setConfirmingDelete(false);
  }, [currentName, isOpen]);

  const handleSave = () => {
    const trimmedName = name.trim();
    if (trimmedName && (title || trimmedName !== currentName)) {
      onSave(trimmedName);
    }
    onClose();
  };

  const handleCancel = () => {
    setName(currentName);
    setConfirmingDelete(false);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleCancel}
      />

      {/* Modal */}
      <div className="relative bg-card border border-border rounded-lg shadow-lg w-full max-w-sm mx-4">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">{title || 'Edit Watchlist'}</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-4">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Watchlist Name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder || 'Enter watchlist name'}
                className="w-full text-foreground bg-background border-input"
                autoFocus
                maxLength={50}
              />
            </div>

            <div className="flex justify-between gap-2 pt-2">
              {/* Delete button (only in edit mode, not create) */}
              {onDelete ? (
                confirmingDelete ? (
                  <Button
                    variant="destructive"
                    onClick={() => { onDelete(); onClose(); }}
                    className="gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Confirm Delete
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={() => setConfirmingDelete(true)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </Button>
                )
              ) : (
                <div />
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  className="text-foreground"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={!name.trim() || (!title && name.trim() === currentName)}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
