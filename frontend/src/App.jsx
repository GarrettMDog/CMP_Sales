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

  const [modalOpen, setModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [deleteTargetId, setDeleteTargetId] = useState(null);

  const [dueContacts, setDueContacts] = useState([]);
  const [upcomingBirthdays, setUpcomingBirthdays] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

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

  useEffect(() => {
  if (!selectedId || !token) { setSelectedContact(null); return; }
  api.getContact(selectedId, token).then(setSelectedContact).catch(() => setSelectedContact(null));
}, [selectedId, contacts, token]);

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

  if (userLoading) {
    return (
      <FluentProvider theme={theme}>
        <div className="app-loading"><Spinner label="Loading your relationships..." /></div>
      </FluentProvider>
    );
  }

  return (
    <FluentProvider theme={theme}>
      <div className="app-shell">
        <div className="app-tabs">
          <TabList selectedValue={activeView} onTabSelect={(_, d) => setActiveView(d.value)}>
            <Tab value="contacts">Contacts</Tab>
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
                onSelect={setSelectedId}
                onAdd={() => { setEditingContact(null); setModalOpen(true); }}
                search={search}
                onSearchChange={setSearch}
                temperatureFilter={temperatureFilter}
                onTemperatureFilterChange={setTemperatureFilter}
                reps={reps}
                repFilter={repFilter}
                onRepFilterChange={setRepFilter}
              />
              <ContactDetail
                contact={selectedContact}
                currentUser={user}
                onLogInteraction={handleLogInteraction}
                onEdit={(c) => { setEditingContact(c); setModalOpen(true); }}
                onDelete={handleDelete}
              />
            </div>
          </>
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
          onClose={() => { setModalOpen(false); setEditingContact(null); }}
          onSave={handleSaveContact}
        />

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
