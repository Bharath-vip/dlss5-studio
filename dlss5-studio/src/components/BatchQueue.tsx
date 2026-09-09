import React, { useState } from 'react';
import { FolderOpen, CheckCircle2, Clock, Save, History, ListOrdered } from 'lucide-react';
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
  onOpenFolder: (path: string) => void;
  onExportAs?: (path: string) => void;
}

export const BatchQueue: React.FC<BatchQueueProps> = ({
  items,
  historyItems = [],
  onOpenFolder,
  onExportAs,
}) => {
  const [activeTab, setActiveTab] = useState<'queue' | 'history'>('queue');

  if (items.length === 0 && historyItems.length === 0) {
    return null;
  }

  const completedCount = items.filter((i) => i.status === 'done').length;

  return (
    <div className="bg-[#0c121e] border border-[#1b263b] rounded-xl p-3.5 space-y-3 shadow-lg">
      {/* Header Tabs */}
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
            <span>BATCH QUEUE ({completedCount}/{items.length})</span>
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
      </div>

      {/* Tab 1: Active Queue */}
      {activeTab === 'queue' && (
        <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
          {items.length === 0 ? (
            <div className="py-4 text-center text-gray-500 font-mono text-xs">
              No items in active queue. Drop media above to begin.
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="p-2.5 bg-[#090e17] border border-[#182335] rounded-lg flex items-center justify-between text-xs font-mono"
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
                    <span className="text-gray-200 truncate block font-medium">{item.filename}</span>
                    <span className="text-[10px] text-gray-500 block truncate">{item.stage}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
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
                          className="px-2 py-1 bg-[#13281d] hover:bg-[#1b3a29] text-[#76b900] hover:text-[#91e400] rounded border border-[#76b900]/30 flex items-center space-x-1 transition-colors text-[11px] cursor-pointer"
                          title="Export or save a copy to any location"
                        >
                          <Save className="w-3 h-3 text-[#76b900]" />
                          <span>Save As</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onOpenFolder(item.outputPath!)}
                        className="px-2 py-1 bg-[#162132] hover:bg-[#202f47] text-gray-300 hover:text-white rounded border border-[#23354f] flex items-center space-x-1 transition-colors text-[11px] cursor-pointer"
                        title="Open Output Folder"
                      >
                        <FolderOpen className="w-3 h-3 text-cyan-400" />
                        <span>Reveal</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 2: Render History */}
      {activeTab === 'history' && (
        <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
          {historyItems.length === 0 ? (
            <div className="py-4 text-center text-gray-500 font-mono text-xs">
              No completed render sessions recorded yet.
            </div>
          ) : (
            historyItems.map((item) => (
              <div
                key={item.id}
                className="p-2.5 bg-[#090e17] border border-[#182335] rounded-lg flex items-center justify-between text-xs font-mono"
              >
                <div className="truncate max-w-[65%]">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#76b900] shrink-0" />
                    <span className="text-gray-200 font-medium truncate">{item.filename}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0">
                      {item.resolution}
                    </span>
                  </div>
                  <div className="flex items-center space-x-3 text-[10px] text-gray-500 mt-0.5 truncate">
                    <span>{item.completedAt}</span>
                    <span>•</span>
                    <span className="text-[#76b900]">{item.elapsedSeconds.toFixed(1)}s elapsed</span>
                    <span>•</span>
                    <span className="truncate">{item.outputPath}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-1.5">
                  {onExportAs && (
                    <button
                      type="button"
                      onClick={() => onExportAs(item.outputPath)}
                      className="px-2 py-1 bg-[#13281d] hover:bg-[#1b3a29] text-[#76b900] rounded border border-[#76b900]/30 flex items-center space-x-1 transition-colors text-[11px] cursor-pointer"
                      title="Export copy"
                    >
                      <Save className="w-3 h-3" />
                      <span>Save As</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpenFolder(item.outputPath)}
                    className="px-2 py-1 bg-[#162132] hover:bg-[#202f47] text-gray-300 hover:text-white rounded border border-[#23354f] flex items-center space-x-1 transition-colors text-[11px] cursor-pointer"
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

