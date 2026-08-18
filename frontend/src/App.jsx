import { useEffect, useState, useCallback } from 'react';
import {
  FluentProvider, teamsLightTheme, teamsDarkTheme, Spinner, TabList, Tab,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions, Button,
} from '@fluentui/react-components';
import { app } from '@microsoft/teams-js';

import ContactList from './components/ContactList.jsx';
import ContactDetail from './components/ContactDetail.jsx';
import AddEditContactModal from './components/AddEditContactModal.jsx';
import RemindersBanner from './components/RemindersBanner.jsx';
import ActivityDashboard from './components/ActivityDashboard.jsx';
import MessageSearchResults from './components/MessageSearchResults.jsx';
import ProjectList from './components/ProjectList.jsx';
import ProjectDetail from './components/ProjectDetail.jsx';
import AddEditProjectModal from './components/AddEditProjectModal.jsx';
import ContactPeek from './components/ContactPeek.jsx';
import ProjectPeek from './components/ProjectPeek.jsx';
import { useTeamsUser } from './useTeamsUser.js';
import { api } from './api.js';
import './styles.css';

export default function App() {
  const { user, token, loading: userLoading } = useTeamsUser();
  const [theme, setTheme] = useState(teamsLightTheme);
  const [activeView, setActiveView] = useState('contacts');

  const [contacts, setContacts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedContact, setSelectedContact] = useState(null);

  const [search, setSearch] = useState('');
  const [temperatureFilter, setTemperatureFilter] = useState('');
  const [repFilter, setRepFilter] = useState('');
  const [reps, setReps] = useState([]);

  // Tier 3 Search History — matching messages, shown in the same panel slot
  // ContactDetail normally occupies (right on desktop, bottom on mobile).
  const [messageResults, setMessageResults] = useState([]);
  const [messageSearchLoading, setMessageSearchLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [deleteTargetId, setDeleteTargetId] = useState(null);

  const [dueContacts, setDueContacts] = useState([]);
  const [upcomingBirthdays, setUpcomingBirthdays] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Projects tab state
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [projectSearch, setProjectSearch] = useState('');
  const [projectStatusFilter, setProjectStatusFilter] = useState('');
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [projectDeleteTarget, setProjectDeleteTarget] = useState(null);
  const [allContacts, setAllContacts] = useState([]); // unfiltered, for the link picker

  // Follow Teams theme (light/dark/high-contrast) so the tab always matches.
  useEffect(() => {
    app.initialize()
      .then(() => {
        app.getContext().then((ctx) => {
          setTheme(ctx.app?.theme === 'dark' ? teamsDarkTheme : teamsLightTheme);
        });
        app.registerOnThemeChangeHandler((newTheme) => {
          setTheme(newTheme === 'dark' ? teamsDarkTheme : teamsLightTheme);
        });
      })
      .catch(() => { /* running outside Teams, keep light theme */ });
  }, []);

  const refreshList = useCallback(async () => {
    setLoadingList(true);
    setErrorMsg('');
    try {
      const params = {};
      if (search) params.q = search;
      if (temperatureFilter) params.temperature = temperatureFilter;
      if (repFilter) params.lastContactedBy = repFilter;
      const [list, due, birthdays, repList] = await Promise.all([
        api.listContacts(params, token),
        api.dueReminders(token),
        api.upcomingBirthdays(30, token),
        api.listReps(token),
      ]);
      setContacts(list);
      setDueContacts(due);
      setUpcomingBirthdays(birthdays);
      setReps(repList);
    } catch (err) {
      setErrorMsg(err.message || 'Could not reach the CRM backend.');
    } finally {
      setLoadingList(false);
    }
  }, [search, temperatureFilter, repFilter, token]);

  useEffect(() => {
    if (!token) return;
    refreshList();
  }, [refreshList, token]);

  // Tier 3 Search History: whenever the search box has text in it, also
  // search message content and show matches in the detail panel slot.
  useEffect(() => {
    if (!token || !search.trim()) {
      setMessageResults([]);
      return;
    }
    let cancelled = false;
    setMessageSearchLoading(true);
    api.searchMessages(search.trim(), token)
      .then((results) => { if (!cancelled) setMessageResults(results); })
      .catch(() => { if (!cancelled) setMessageResults([]); })
      .finally(() => { if (!cancelled) setMessageSearchLoading(false); });
    return () => { cancelled = true; };
  }, [search, token]);

  useEffect(() => {
    if (!selectedId || !token) { setSelectedContact(null); return; }
    api.getContact(selectedId, token).then(setSelectedContact).catch(() => setSelectedContact(null));
  }, [selectedId, contacts, token]);

  // --- Projects data ---
  const refreshProjects = useCallback(async () => {
    if (!token) return;
    try {
      const params = {};
      if (projectSearch) params.q = projectSearch;
      if (projectStatusFilter) params.status = projectStatusFilter;
      const list = await api.listProjects(params, token);
      setProjects(list);
    } catch {
      setProjects([]);
    }
  }, [projectSearch, projectStatusFilter, token]);

  useEffect(() => { refreshProjects(); }, [refreshProjects]);

  // Unfiltered contact list for the "add contact to project" picker.
  useEffect(() => {
    if (!token) return;
    api.listContacts({}, token).then(setAllContacts).catch(() => setAllContacts([]));
  }, [token, contacts]);

  // Unfiltered projects list for the contact-side "add to project" picker.
  const [allProjects, setAllProjects] = useState([]);
  const [peekContactId, setPeekContactId] = useState(null);
  const [peekDefaultProjectId, setPeekDefaultProjectId] = useState(null);
  const [peekProjectId, setPeekProjectId] = useState(null);
  useEffect(() => {
    if (!token) return;
    api.listProjects({}, token).then(setAllProjects).catch(() => setAllProjects([]));
  }, [token, projects]);

  useEffect(() => {
    if (!selectedProjectId || !token) { setSelectedProject(null); return; }
    api.getProject(selectedProjectId, token).then(setSelectedProject).catch(() => setSelectedProject(null));
  }, [selectedProjectId, token]);

  async function reloadProject() {
    if (!selectedProjectId) return;
    const updated = await api.getProject(selectedProjectId, token);
    setSelectedProject(updated);
  }

  async function handleSaveProject(data) {
    if (editingProject) {
      await api.updateProject(editingProject.id, data, token);
      if (selectedProjectId === editingProject.id) reloadProject();
    } else {
      const created = await api.createProject(data, token);
      setSelectedProjectId(created.id);
    }
    setProjectModalOpen(false);
    setEditingProject(null);
    refreshProjects();
  }

  async function confirmDeleteProject() {
    const id = projectDeleteTarget;
    setProjectDeleteTarget(null);
    await api.deleteProject(id, token);
    if (selectedProjectId === id) { setSelectedProjectId(null); setSelectedProject(null); }
    refreshProjects();
  }

  async function handleLinkContact(contactId) {
    await api.linkProjectContact(selectedProjectId, contactId, token);
    reloadProject();
    refreshProjects();
  }

  async function handleUnlinkContact(contactId) {
    await api.unlinkProjectContact(selectedProjectId, contactId, token);
    reloadProject();
    refreshProjects();
  }

  async function handleAddProjectEvent(note) {
    await api.addProjectEvent(selectedProjectId, { note }, token);
    reloadProject();
  }

  // Contact-side linking (both-direction): link/unlink the currently open
  // contact to/from a project, then reload the contact so its projects list
  // (and the log-form picker) updates.
  async function handleLinkContactToProject(projectId) {
    await api.linkProjectContact(projectId, selectedId, token);
    const updated = await api.getContact(selectedId, token);
    setSelectedContact(updated);
    refreshProjects();
  }

  async function handleUnlinkContactFromProject(projectId) {
    await api.unlinkProjectContact(projectId, selectedId, token);
    const updated = await api.getContact(selectedId, token);
    setSelectedContact(updated);
    refreshProjects();
  }

  async function handleSaveContact(data) {
    if (editingContact) {
      await api.updateContact(editingContact.id, data, token);
    } else {
      const created = await api.createContact(data, token);
      setSelectedId(created.id);
    }
    setModalOpen(false);
    setEditingContact(null);
    refreshList();
  }

  async function handleLogInteraction(id, data) {
    await api.logInteraction(id, data, token);
    const updated = await api.getContact(id, token);
    setSelectedContact(updated);
    refreshList();
  }

  async function handleEditInteraction(interactionId, data) {
    await api.updateInteraction(interactionId, data, token);
    const updated = await api.getContact(selectedId, token);
    setSelectedContact(updated);
  }

  async function handleDeleteInteraction(interactionId) {
    // Backend returns the recalculated contact (reminder clock re-derived).
    const updated = await api.deleteInteraction(interactionId, token);
    setSelectedContact(updated);
    refreshList();
  }

  function handleDelete(id) {
    setDeleteTargetId(id);
  }

  async function confirmDelete() {
    const id = deleteTargetId;
    setDeleteTargetId(null);
    await api.deleteContact(id, token);
    if (selectedId === id) setSelectedId(null);
    refreshList();
  }

  // Clicking a message match jumps to that contact and clears the search,
  // so the panel drops back into the normal single-contact detail view.
  function handleSelectFromMessageSearch(contactId) {
    setSearch('');
    setSelectedId(contactId);
  }

  // Typing in the search box reverts the panel to message results (clears any
  // contact card that was open). Clicking a contact in the list then re-shows
  // that contact's card — see the panel logic below.
  function handleSearchChange(value) {
    setSearch(value);
    setSelectedId(null);
  }

  // Clicking a contact while a search is active shows their card instead of
  // staying stuck on message results (the previous behavior made list names
  // feel un-clickable). Message results show while searching UNTIL a contact
  // is selected.
  function handleSelectContact(contactId) {
    setSelectedId(contactId);
  }

  if (userLoading) {
    return (
      <FluentProvider theme={theme}>
        <div className="app-loading"><Spinner label="Loading your relationships..." /></div>
      </FluentProvider>
    );
  }

  const showMessageSearch = search.trim().length > 0 && !selectedId;

  return (
    <FluentProvider theme={theme}>
      <div className="app-shell">
        <header className="app-header">
          <span className="app-header__name">Bedrock</span>
          <span className="app-header__tagline">Building your foundation</span>
        </header>
        <div className="app-tabs">
          <TabList selectedValue={activeView} onTabSelect={(_, d) => setActiveView(d.value)}>
            <Tab value="contacts">Contacts</Tab>
            <Tab value="projects">Projects</Tab>
            <Tab value="activity">Activity</Tab>
          </TabList>
        </div>

        {activeView === 'contacts' && (
          <>
            <RemindersBanner
              dueContacts={dueContacts}
              upcomingBirthdays={upcomingBirthdays}
              onSelect={setSelectedId}
            />

            {errorMsg && (
              <div className="app-error">
                {errorMsg} — showing an empty list until the backend at your configured API URL is reachable.
              </div>
            )}

            <div className="app-body">
              <ContactList
                contacts={contacts}
                selectedId={selectedId}
                onSelect={handleSelectContact}
                onAdd={() => { setEditingContact(null); setModalOpen(true); }}
                search={search}
                onSearchChange={handleSearchChange}
                temperatureFilter={temperatureFilter}
                onTemperatureFilterChange={setTemperatureFilter}
                reps={reps}
                repFilter={repFilter}
                onRepFilterChange={setRepFilter}
              />

              {showMessageSearch ? (
                <MessageSearchResults
                  query={search.trim()}
                  results={messageResults}
                  loading={messageSearchLoading}
                  onSelectContact={handleSelectFromMessageSearch}
                />
              ) : (
                <ContactDetail
                  contact={selectedContact}
                  currentUser={user}
                  onLogInteraction={handleLogInteraction}
                  onEditInteraction={handleEditInteraction}
                  onDeleteInteraction={handleDeleteInteraction}
                  onEdit={(c) => { setEditingContact(c); setModalOpen(true); }}
                  onDelete={handleDelete}
                  allProjects={allProjects}
                  onLinkProject={handleLinkContactToProject}
                  onUnlinkProject={handleUnlinkContactFromProject}
                  onOpenProject={(projectId) => { setSelectedProjectId(projectId); setActiveView('projects'); }}
                  onPeekProject={(projectId) => setPeekProjectId(projectId)}
                />
              )}
            </div>
          </>
        )}

        {activeView === 'projects' && (
          <div className="app-body">
            <ProjectList
              projects={projects}
              selectedId={selectedProjectId}
              onSelect={setSelectedProjectId}
              onAdd={() => { setEditingProject(null); setProjectModalOpen(true); }}
              search={projectSearch}
              onSearchChange={setProjectSearch}
              statusFilter={projectStatusFilter}
              onStatusFilterChange={setProjectStatusFilter}
            />
            <ProjectDetail
              project={selectedProject}
              allContacts={allContacts}
              onEdit={(p) => { setEditingProject(p); setProjectModalOpen(true); }}
              onDelete={(p) => setProjectDeleteTarget(p.id)}
              onLinkContact={handleLinkContact}
              onUnlinkContact={handleUnlinkContact}
              onAddEvent={handleAddProjectEvent}
              onOpenContact={(contactId) => { setSelectedId(contactId); setActiveView('contacts'); }}
              onPeekContact={(contactId) => { setPeekDefaultProjectId(selectedProjectId); setPeekContactId(contactId); }}
            />
          </div>
        )}

        {activeView === 'activity' && (
          <ActivityDashboard
            onSelectContact={(contactId) => { setSelectedId(contactId); setActiveView('contacts'); }}
            token={token}
          />
        )}

        <AddEditContactModal
          open={modalOpen}
          initial={editingContact}
          companies={[...new Set(allContacts.map((c) => (c.company || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))}
          onClose={() => { setModalOpen(false); setEditingContact(null); }}
          onSave={handleSaveContact}
        />

        <AddEditProjectModal
          open={projectModalOpen}
          initial={editingProject}
          onClose={() => { setProjectModalOpen(false); setEditingProject(null); }}
          onSave={handleSaveProject}
        />

        <ContactPeek
          open={!!peekContactId}
          contactId={peekContactId}
          token={token}
          currentUser={user}
          defaultProjectId={peekDefaultProjectId}
          onClose={() => { setPeekContactId(null); setPeekDefaultProjectId(null); }}
          onOpenFull={(contactId) => { setPeekContactId(null); setPeekDefaultProjectId(null); setSelectedId(contactId); setActiveView('contacts'); }}
        />

        <ProjectPeek
          open={!!peekProjectId}
          projectId={peekProjectId}
          token={token}
          onClose={() => setPeekProjectId(null)}
          onOpenFull={(projectId) => { setPeekProjectId(null); setSelectedProjectId(projectId); setActiveView('projects'); }}
        />

        <Dialog open={!!projectDeleteTarget} onOpenChange={(_, data) => { if (!data.open) setProjectDeleteTarget(null); }}>
          <DialogSurface>
            <DialogBody>
              <DialogTitle>Remove this project?</DialogTitle>
              <DialogContent>
                The project and its contact links are removed. Touchpoints stay on their contacts;
                any tags to this project are cleared. This cannot be undone.
              </DialogContent>
              <DialogActions>
                <Button appearance="secondary" onClick={() => setProjectDeleteTarget(null)}>Cancel</Button>
                <Button appearance="primary" onClick={confirmDeleteProject}>Delete</Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>

        <Dialog open={!!deleteTargetId} onOpenChange={(_, data) => { if (!data.open) setDeleteTargetId(null); }}>
          <DialogSurface>
            <DialogBody>
              <DialogTitle>Remove this contact?</DialogTitle>
              <DialogContent>This cannot be undone.</DialogContent>
              <DialogActions>
                <Button appearance="secondary" onClick={() => setDeleteTargetId(null)}>Cancel</Button>
                <Button appearance="primary" onClick={confirmDelete}>Delete</Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      </div>
    </FluentProvider>
  );
}
