import { ParameterPanel } from "@vlt/ui";
import { useMidiContext } from "./context/MidiContext.js";
import { PresetBar } from "./PresetBar.js";
import { PresetLibraryPanel } from "./PresetLibraryPanel.js";

export function EditorShell() {
  const {
    conn,
    scope,
    setScope,
    activeGroup,
    setActiveGroup,
    searchQuery,
    setSearchQuery,
    getValue,
    setValue,
    refreshGroup,
    refreshSearch,
    presetSlot,
    setPresetSlot,
    presetName,
    setPresetName,
    loadPresetFromDevice,
    loadAllNamesFromDevice,
    loadAllFullFromDevice,
    cancelBulkTransfer,
    bulkActive,
    slotOptions,
    savePresetToDevice,
    presetStatus,
    hasLoadedSnapshot,
    showDebug,
    setShowDebug,
    lastIn,
    lastOut,
    visibleParameters,
    groups,
    workspace,
    backups,
    libraryStatus,
    selectedWorkspaceSlot,
    setSelectedWorkspaceSlot,
    backupWorkspace,
    exportSelectedPreset,
    importPresetFile,
    sendWorkspaceToDevice,
    sendAllToDevice,
    copyWorkspacePreset,
    swapWorkspacePresets,
    saveSnapshotBackup,
    refreshBackups,
    mainView,
    setMainView,
  } = useMidiContext();

  const filteredGroups = groups.filter((g) =>
    scope === "preset" ? g.presetCount > 0 : g.systemCount > 0
  );

  return (
    <div className="editor-shell">
      <header className="editor-header">
        <div>
          <h1>Voice Live Touch Editor</h1>
          <p className="subtitle">Full SysEx editor · VoiceLive Touch v1</p>
        </div>
        <div className="header-actions">
          {!conn.connected ? (
            <button onClick={() => void conn.connect()} disabled={conn.connecting}>
              {conn.connecting ? "Connecting…" : "Connect MIDI"}
            </button>
          ) : (
            <button className="secondary" onClick={conn.disconnect}>
              Disconnect
            </button>
          )}
          <button
            type="button"
            className={mainView === "editor" ? "secondary" : "secondary"}
            onClick={() => setMainView("editor")}
          >
            Editor
          </button>
          <button
            type="button"
            className={mainView === "library" ? "" : "secondary"}
            onClick={() => setMainView("library")}
          >
            Library
          </button>
        </div>
      </header>

      {conn.error && <p className="error">{conn.error}</p>}

      {conn.connected && (
        <div className="connection-bar">
          <label>
            Output
            <select
              value={conn.selectedOutputId}
              onChange={(e) => conn.setSelectedOutputId(e.target.value)}
            >
              {conn.outputs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name || o.id}
                </option>
              ))}
            </select>
          </label>
          <label>
            SysEx ID
            <input
              type="number"
              min={0}
              max={127}
              value={conn.sysexId}
              onChange={(e) => conn.setSysexId(Number(e.target.value))}
            />
          </label>
          <label>
            Scope
            <select value={scope} onChange={(e) => setScope(e.target.value as "preset" | "system")}>
              <option value="preset">Preset (live step)</option>
              <option value="system">System / setup</option>
            </select>
          </label>
          <label className="search-field">
            Search
            <input
              type="search"
              placeholder="Name or ID…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && refreshSearch()}
            />
          </label>
          <label className="debug-toggle">
            <input
              type="checkbox"
              checked={showDebug}
              onChange={(e) => setShowDebug(e.target.checked)}
            />
            Debug hex
          </label>
        </div>
      )}

      {conn.connected && mainView === "editor" && (
        <PresetBar
          presetSlot={presetSlot}
          slotOptions={slotOptions}
          onPresetSlotChange={setPresetSlot}
          presetName={presetName}
          onPresetNameChange={setPresetName}
          onLoad={loadPresetFromDevice}
          onLoadAllNames={loadAllNamesFromDevice}
          onCancelBulk={cancelBulkTransfer}
          onSave={savePresetToDevice}
          transferStatus={presetStatus}
          hasLoadedSnapshot={hasLoadedSnapshot}
          connected={conn.connected}
          bulkActive={bulkActive}
        />
      )}

      {scope === "system" && conn.connected && mainView === "editor" && (
        <div className="banner warn">
          Global device settings — changes affect all presets.
        </div>
      )}

      <div className="editor-body">
        {mainView === "editor" ? (
          <>
            <nav className="sidebar" aria-label="Parameter groups">
              {!searchQuery &&
                filteredGroups.map((g) => {
                  const count = scope === "preset" ? g.presetCount : g.systemCount;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      className={activeGroup === g.id ? "nav-item active" : "nav-item"}
                      onClick={() => setActiveGroup(g.id)}
                    >
                      {g.label}
                      <span className="badge">{count}</span>
                    </button>
                  );
                })}
              {searchQuery && (
                <p className="subtitle sidebar-note">
                  Search: {visibleParameters.length} matches
                </p>
              )}
            </nav>

            <main className="main-panel">
              {!conn.connected ? (
                <p className="vlt-empty">Connect MIDI to edit parameters.</p>
              ) : (
                <>
                  <div className="panel-header">
                    <h2>{searchQuery ? `Search: “${searchQuery}”` : activeGroup}</h2>
                    <button type="button" className="secondary" onClick={refreshGroup}>
                      Refresh group
                    </button>
                  </div>
                  {conn.inputPortName && (
                    <p className="subtitle input-line">Input: {conn.inputPortName}</p>
                  )}
                  <ParameterPanel
                    parameters={visibleParameters}
                    getValue={getValue}
                    setValue={setValue}
                  />
                </>
              )}
            </main>
          </>
        ) : (
          <PresetLibraryPanel
            workspace={workspace}
            backups={backups}
            libraryStatus={libraryStatus}
            connected={conn.connected}
            bulkActive={bulkActive}
            selectedWorkspaceSlot={selectedWorkspaceSlot}
            onSelectSlot={(slot) => {
              setSelectedWorkspaceSlot(slot);
              const entry = workspace.find((e) => e.slot === slot);
              if (entry) {
                setPresetSlot(entry.slot);
                setPresetName(entry.name);
              }
            }}
            onLoadAllNames={loadAllNamesFromDevice}
            onLoadAllFull={loadAllFullFromDevice}
            onCancelBulk={cancelBulkTransfer}
            onBackupWorkspace={() => void saveSnapshotBackup()}
            onExportSelected={() => void exportSelectedPreset()}
            onImport={() => void importPresetFile()}
            onSendToDevice={sendWorkspaceToDevice}
            onSendAllToDevice={sendAllToDevice}
            onCopy={copyWorkspacePreset}
            onSwap={swapWorkspacePresets}
            onRefreshBackups={() => void refreshBackups()}
          />
        )}
      </div>

      <footer className="status-footer">
        <div>
          <strong>Status:</strong> {conn.statusText}
          {presetStatus && <> · {presetStatus}</>}
          {libraryStatus && mainView === "library" && <> · {libraryStatus}</>}
        </div>
        {showDebug && lastOut && (
          <div>
            <strong>Out:</strong> {lastOut}
          </div>
        )}
        {showDebug && lastIn && (
          <div>
            <strong>In:</strong> {lastIn}
          </div>
        )}
      </footer>
    </div>
  );
}
