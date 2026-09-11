import React, { useState } from 'react';
import { FolderOpen, CheckCircle2, Clock, Save, History, ListOrdered, Trash2, X, Eye } from 'lucide-react';
import type { RenderHistoryItem } from '../types/pipeline';

export interface BatchItem {
  id: string;
  filename: string;
  status: 'pending' | 'processing' | 'done' | 'failed';
  progress: number;
  stage: string;
  outputPath?: string;
  resolution?: string;
}

interface BatchQueueProps {
  items: BatchItem[];
  historyItems?: RenderHistoryItem[];
  activeItemIndex?: number;
  onSelectItem?: (index: number) => void;
  onRemoveItem?: (index: number) => void;
  onClearCompleted?: () => void;
  onClearHistory?: () => void;
  onPreviewHistory?: (item: RenderHistoryItem) => void;
  onOpenFolder: (path: string) => void;
  onExportAs?: (path: string) => void;
}

export const BatchQueue: React.FC<BatchQueueProps> = ({
  items,
  historyItems = [],
  activeItemIndex = 0,
  onSelectItem,
  onRemoveItem,
  onClearCompleted,
  onClearHistory,
  onPreviewHistory,
  onOpenFolder,
  onExportAs,
}) => {
  const [activeTab, setActiveTab] = useState<'queue' | 'history'>('queue');

  if (items.length === 0 && historyItems.length === 0) {
    return null;
  }

  const completedCount = items.filter((i) => i.status === 'done').length;

  return (
    <div className="bg-[#0c121e] border border-[#1b263b] rounded-xl p-3 space-y-2.5 shadow-lg">
      {/* Header Tabs with Actions */}
      <div className="flex items-center justify-between border-b border-[#182336] pb-2 text-xs font-mono">
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setActiveTab('queue')}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded transition-colors cursor-pointer ${
              activeTab === 'queue'
                ? 'bg-[#162438] text-white font-bold border border-[#233752]'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <ListOrdered className="w-3.5 h-3.5 text-[#76b900]" />
            <span>
              BATCH QUEUE ({completedCount}/{items.length})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded transition-colors cursor-pointer ${
              activeTab === 'history'
                ? 'bg-[#162438] text-white font-bold border border-[#233752]'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <History className="w-3.5 h-3.5 text-cyan-400" />
            <span>RENDER HISTORY ({historyItems.length})</span>
          </button>
        </div>

        {/* Tab Specific Actions */}
        <div className="flex items-center space-x-2">
          {activeTab === 'queue' && completedCount > 0 && onClearCompleted && (
            <button
              type="button"
              onClick={onClearCompleted}
              className="text-[10px] text-gray-400 hover:text-rose-400 flex items-center space-x-1 cursor-pointer transition-colors"
              title="Remove all completed tasks from queue"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear Done</span>
            </button>
          )}

          {activeTab === 'history' && historyItems.length > 0 && onClearHistory && (
            <button
              type="button"
              onClick={onClearHistory}
              className="text-[10px] text-gray-400 hover:text-rose-400 flex items-center space-x-1 cursor-pointer transition-colors"
              title="Clear all saved render history"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear History</span>
            </button>
          )}
        </div>
      </div>

      {/* Tab 1: Active Queue */}
      {activeTab === 'queue' && (
        <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
          {items.length === 0 ? (
            <div className="py-4 text-center text-gray-500 font-mono text-xs">
              No items in active queue. Drop media above to begin.
            </div>
          ) : (
            items.map((item, idx) => {
              const isSelected = idx === activeItemIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => onSelectItem?.(idx)}
                  className={`p-2 bg-[#090e17] rounded-lg flex items-center justify-between text-xs font-mono border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-[#76b900]/70 bg-[#0c161a] shadow-sm shadow-[#76b900]/10'
                      : 'border-[#182335] hover:border-[#22334d]'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 truncate max-w-[60%]">
                    {item.status === 'done' ? (
                      <CheckCircle2 className="w-4 h-4 text-[#76b900] shrink-0" />
                    ) : item.status === 'processing' ? (
                      <Clock className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />
                    ) : (
                      <Clock className="w-4 h-4 text-gray-600 shrink-0" />
                    )}
                    <div className="truncate">
                      <div className="flex items-center space-x-1.5">
                        <span className={`truncate font-medium ${isSelected ? 'text-white font-bold' : 'text-gray-200'}`}>
                          {item.filename}
                        </span>
                        {item.resolution && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-cyan-500/15 text-cyan-300 font-bold">
                            {item.resolution}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-gray-500 block truncate">{item.stage}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
                    {item.status === 'processing' && (
                      <div className="flex items-center space-x-2">
                        <div className="w-20 bg-gray-800 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-[#76b900] h-full transition-all duration-300"
                            style={{ width: `${item.progress * 100}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-[#76b900] w-9 text-right font-bold">
                          {(item.progress * 100).toFixed(0)}%
                        </span>
                      </div>
                    )}

                    {item.status === 'done' && item.outputPath && (
                      <div className="flex items-center space-x-1.5">
                        {onExportAs && (
                          <button
                            type="button"
                            onClick={() => onExportAs(item.outputPath!)}
                            className="px-2 py-1 bg-[#13281d] hover:bg-[#1b3a29] text-[#76b900] hover:text-[#91e400] rounded border border-[#76b900]/30 flex items-center space-x-1 transition-colors text-[10px] cursor-pointer"
                            title="Export or save a copy to any location"
                          >
                            <Save className="w-3 h-3 text-[#76b900]" />
                            <span>Save As</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onOpenFolder(item.outputPath!)}
                          className="px-2 py-1 bg-[#162132] hover:bg-[#202f47] text-gray-300 hover:text-white rounded border border-[#23354f] flex items-center space-x-1 transition-colors text-[10px] cursor-pointer"
                          title="Open Output Folder"
                        >
                          <FolderOpen className="w-3 h-3 text-cyan-400" />
                          <span>Reveal</span>
                        </button>
                      </div>
                    )}

                    {item.status === 'pending' && onRemoveItem && (
                      <button
                        type="button"
                        onClick={() => onRemoveItem(idx)}
                        className="p-1 text-gray-500 hover:text-rose-400 rounded transition-colors cursor-pointer"
                        title="Remove item from queue"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Tab 2: Render History */}
      {activeTab === 'history' && (
        <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
          {historyItems.length === 0 ? (
            <div className="py-4 text-center text-gray-500 font-mono text-xs">
              No completed render sessions recorded yet.
            </div>
          ) : (
            historyItems.map((item) => (
              <div
                key={item.id}
                className="p-2 bg-[#090e17] border border-[#182335] hover:border-[#22334d] rounded-lg flex items-center justify-between text-xs font-mono transition-colors"
              >
                <div className="truncate max-w-[62%]">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#76b900] shrink-0" />
                    <span className="text-gray-200 font-medium truncate">{item.filename}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0">
                      {item.resolution}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 text-[10px] text-gray-500 mt-0.5 truncate">
                    <span>{item.completedAt}</span>
                    <span>•</span>
                    <span className="text-[#76b900]">{item.elapsedSeconds.toFixed(1)}s</span>
                    <span>•</span>
                    <span className="truncate">{item.outputPath}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-1.5 shrink-0">
                  {onPreviewHistory && (
                    <button
                      type="button"
                      onClick={() => onPreviewHistory(item)}
                      className="px-2 py-1 bg-[#142332] hover:bg-[#1b3248] text-cyan-300 hover:text-cyan-100 rounded border border-cyan-500/30 flex items-center space-x-1 transition-colors text-[10px] cursor-pointer"
                      title="Load in SplitSlider Viewport"
                    >
                      <Eye className="w-3 h-3 text-cyan-400" />
                      <span>Preview</span>
                    </button>
                  )}
                  {onExportAs && (
                    <button
                      type="button"
                      onClick={() => onExportAs(item.outputPath)}
                      className="px-2 py-1 bg-[#13281d] hover:bg-[#1b3a29] text-[#76b900] rounded border border-[#76b900]/30 flex items-center space-x-1 transition-colors text-[10px] cursor-pointer"
                      title="Export copy"
                    >
                      <Save className="w-3 h-3" />
                      <span>Save As</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpenFolder(item.outputPath)}
                    className="px-2 py-1 bg-[#162132] hover:bg-[#202f47] text-gray-300 hover:text-white rounded border border-[#23354f] flex items-center space-x-1 transition-colors text-[10px] cursor-pointer"
                    title="Reveal in folder"
                  >
                    <FolderOpen className="w-3 h-3 text-cyan-400" />
                    <span>Reveal</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
