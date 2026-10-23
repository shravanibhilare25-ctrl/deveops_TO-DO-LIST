const USERS_KEY = 'daylight_users_v1';
const SESSION_KEY = 'daylight_session_v1';
const STATE_KEY_PREFIX = 'daylight_state_v1:';
const LEGACY_TASKS_KEY = 'todo_tasks_v1';
const PASSWORD_ITERATIONS = 150000;
const DEFAULT_CATEGORIES = ['College', 'Personal', 'Work', 'Projects'];
const CATEGORY_COLORS = [
  { ink: '#6a7b5e', pale: '#eef3e9', dark: '#374131', light: '#c5d4b8' },
  { ink: '#a27754', pale: '#f7f0e8', dark: '#44382e', light: '#ddc4aa' },
  { ink: '#627a8f', pale: '#edf2f6', dark: '#303c46', light: '#bbccda' },
  { ink: '#96725d', pale: '#f5eeea', dark: '#44352f', light: '#dac3b7' },
  { ink: '#7d6c98', pale: '#f1eef5', dark: '#3e3747', light: '#cdc1dc' }
];
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

const authScreen = document.getElementById('auth-screen');
const appScreen = document.getElementById('app-screen');
const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const authSubtitle = document.getElementById('auth-subtitle');
const authError = document.getElementById('auth-error');
const usernameInput = document.getElementById('username-input');
const passwordInput = document.getElementById('password-input');
const confirmPasswordField = document.getElementById('confirm-password-field');
const confirmPasswordInput = document.getElementById('confirm-password-input');
const authSubmitLabel = document.getElementById('auth-submit-label');
const loginTab = document.getElementById('login-tab');
const registerTab = document.getElementById('register-tab');
const taskDialog = document.getElementById('task-dialog');
const taskForm = document.getElementById('task-form');
const confirmDialog = document.getElementById('confirm-dialog');
const categoryDialog = document.getElementById('category-dialog');
const taskList = document.getElementById('task-list');
const emptyState = document.getElementById('empty-state');
const taskSearch = document.getElementById('task-search');
const priorityFilter = document.getElementById('priority-filter');
const sortTasks = document.getElementById('sort-tasks');
const themeToggle = document.getElementById('theme-toggle');
const toast = document.getElementById('toast');

let users = [];
let currentUser = null;
let state = createDefaultState();
let authMode = 'login';
let activeView = 'all';
let activeStatus = 'all';
let selectedCategory = null;
let editingTaskId = null;
let confirmAction = null;
let toastTimer = null;
let timerInterval = null;
let timerMode = 'focus';
let timerSeconds = 25 * 60;
let timerRunning = false;

function createDefaultState() {
  return {
    tasks: [],
    categories: [...DEFAULT_CATEGORIES],
    goal: 5,
    activity: [],
    focusSessionDate: todayKey(),
    focusSessions: 0,
    theme: 'light'
  };
}

function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function newId() {
  return crypto.randomUUID();
}

function getStorageKey(username) {
  return `${STATE_KEY_PREFIX}${encodeURIComponent(username)}`;
}

function validateUsers(value) {
  if (!Array.isArray(value) || value.some(user =>
    !user ||
    typeof user.username !== 'string' ||
    !/^[a-z0-9_]{3,32}$/.test(user.username) ||
    typeof user.salt !== 'string' ||
    typeof user.passwordHash !== 'string'
  )) {
    throw new Error('Saved account data could not be read. Please clear this site’s browser data and register again.');
  }
  return value;
}

function validateTask(task) {
  return Boolean(
    task &&
    typeof task.id === 'string' &&
    typeof task.title === 'string' &&
    typeof task.description === 'string' &&
    typeof task.completed === 'boolean' &&
    typeof task.favorite === 'boolean' &&
    ['high', 'medium', 'low'].includes(task.priority) &&
    typeof task.category === 'string' &&
    (task.dueDate === '' || validDate(task.dueDate)) &&
    typeof task.createdAt === 'string' &&
    (task.completedAt === null || typeof task.completedAt === 'string')
  );
}

function normalizeTask(task) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    completed: task.completed,
    completedAt: task.completedAt || null,
    favorite: task.favorite,
    priority: task.priority,
    category: task.category,
    dueDate: task.dueDate,
    createdAt: task.createdAt
  };
}

function validateState(raw) {
  const saved = JSON.parse(raw);
  if (!saved || typeof saved !== 'object' || !Array.isArray(saved.tasks) ||
      saved.tasks.some(task => !validateTask(task)) ||
      !Array.isArray(saved.categories) ||
      saved.categories.some(category => typeof category !== 'string' || !category.trim()) ||
      !Number.isInteger(saved.goal) || saved.goal < 1 || saved.goal > 20 ||
      !Array.isArray(saved.activity)) {
    throw new Error('Saved to-do data could not be read. It has been left untouched; clear this site’s browser data to start fresh.');
  }
  const categories = [...new Set([...DEFAULT_CATEGORIES, ...saved.categories])];
  saved.tasks.forEach(task => {
    if (!categories.includes(task.category)) categories.push(task.category);
  });
  return {
    tasks: saved.tasks.map(normalizeTask),
    categories,
    goal: saved.goal,
    activity: saved.activity.filter(entry =>
      entry &&
      typeof entry.id === 'string' &&
      typeof entry.message === 'string' &&
      typeof entry.at === 'string' &&
      Number.isFinite(Date.parse(entry.at))
    ).slice(0, 60),
    focusSessionDate: saved.focusSessionDate === todayKey() ? saved.focusSessionDate : todayKey(),
    focusSessions: saved.focusSessionDate === todayKey() && Number.isInteger(saved.focusSessions)
      ? Math.max(0, saved.focusSessions)
      : 0,
    theme: saved.theme === 'dark' ? 'dark' : 'light'
  };
}

function loadUserState(username) {
  const saved = localStorage.getItem(getStorageKey(username));
  if (saved !== null) return validateState(saved);

  const initial = createDefaultState();
  if (!localStorage.getItem(LEGACY_TASKS_KEY)) return initial;

  const legacy = JSON.parse(localStorage.getItem(LEGACY_TASKS_KEY));
  if (!Array.isArray(legacy) || legacy.some(task =>
    !task ||
    typeof task.id !== 'string' ||
    typeof task.text !== 'string' ||
    typeof task.completed !== 'boolean'
  )) {
    throw new Error('Older saved task data could not be read. It has been left untouched.');
  }
  initial.tasks = legacy.map(task => ({
    id: task.id,
    title: task.text.trim(),
    description: '',
    completed: task.completed,
    completedAt: task.completed ? (task.createdAt || new Date().toISOString()) : null,
    favorite: false,
    priority: 'medium',
    category: 'College',
    dueDate: '',
    createdAt: typeof task.createdAt === 'string' ? task.createdAt : new Date().toISOString()
  })).filter(task => task.title);
  return initial;
}

function persist(nextState) {
  if (!currentUser) throw new Error('Sign in to save your tasks.');
  localStorage.setItem(getStorageKey(currentUser.username), JSON.stringify(nextState));
  state = nextState;
}

function addActivity(message, activityState = state) {
  return [{ id: newId(), message, at: new Date().toISOString() }, ...activityState.activity].slice(0, 40);
}

function commit(nextState, celebrateId = null) {
  persist(nextState);
  renderAll(celebrateId);
}

function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle('is-error', isError);
  toast.classList.add('is-visible');
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3200);
}

function setAuthError(message) {
  authError.textContent = message;
  authError.hidden = !message;
}

function setAuthMode(mode) {
  authMode = mode;
  const registering = mode === 'register';
  confirmPasswordField.hidden = !registering;
  confirmPasswordInput.required = registering;
  passwordInput.autocomplete = registering ? 'new-password' : 'current-password';
  loginTab.classList.toggle('is-active', !registering);
  registerTab.classList.toggle('is-active', registering);
  loginTab.setAttribute('aria-selected', String(!registering));
  registerTab.setAttribute('aria-selected', String(registering));
  authTitle.textContent = registering ? 'Create your account' : 'Welcome back';
  authSubtitle.textContent = registering ? 'A username and password are all you need.' : 'Sign in to your little corner of calm.';
  authSubmitLabel.textContent = registering ? 'Create my account' : 'Sign in to your space';
  setAuthError('');
}

function hex(bytes) {
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

function makeSalt() {
  if (!window.crypto?.subtle || !window.crypto?.getRandomValues) {
    throw new Error('Secure password storage is unavailable. Open this app on localhost or HTTPS.');
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return hex(bytes);
}

async function hashPassword(password, salt) {
  if (!window.crypto?.subtle) {
    throw new Error('Secure password storage is unavailable. Open this app on localhost or HTTPS.');
  }
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const result = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt: new TextEncoder().encode(salt),
    iterations: PASSWORD_ITERATIONS
  }, material, 256);
  return hex(result);
}

function activateAccount(user, initialState) {
  currentUser = user;
  state = initialState;
  sessionStorage.setItem(SESSION_KEY, user.username);
  authScreen.hidden = true;
  appScreen.hidden = false;
  document.getElementById('account-name').textContent = user.username;
  document.getElementById('account-avatar').textContent = user.username.charAt(0).toUpperCase();
  taskSearch.value = '';
  activeView = 'all';
  activeStatus = 'all';
  selectedCategory = null;
  priorityFilter.value = 'all';
  sortTasks.value = 'created';
  applyTheme(state.theme);
  updateNavigation();
  renderAll();
}

async function handleAuth(event) {
  event.preventDefault();
  setAuthError('');
  if (!authForm.reportValidity()) return;
  const username = usernameInput.value.trim().toLowerCase();
  const password = passwordInput.value;
  const submit = document.getElementById('auth-submit');
  submit.disabled = true;

  try {
    users = validateUsers(JSON.parse(localStorage.getItem(USERS_KEY) || '[]'));
    if (authMode === 'register') {
      if (!/^[a-z0-9_]{3,32}$/.test(username)) {
        throw new Error('Use 3–32 letters, numbers, or underscores for your username.');
      }
      if (password !== confirmPasswordInput.value) throw new Error('Those passwords don’t match yet.');
      if (users.some(user => user.username === username)) throw new Error('That username is taken. Try another one.');
      const salt = makeSalt();
      const user = { username, salt, passwordHash: await hashPassword(password, salt) };
      const initialState = loadUserState(username);
      const nextUsers = [...users, user];
      localStorage.setItem(USERS_KEY, JSON.stringify(nextUsers));
      localStorage.setItem(getStorageKey(username), JSON.stringify(initialState));
      if (localStorage.getItem(LEGACY_TASKS_KEY) !== null) localStorage.removeItem(LEGACY_TASKS_KEY);
      users = nextUsers;
      activateAccount(user, initialState);
      showToast(`You’re all set, ${username}. Welcome in!`);
    } else {
      const user = users.find(account => account.username === username);
      if (!user || await hashPassword(password, user.salt) !== user.passwordHash) {
        throw new Error('That username and password don’t match. Please try again.');
      }
      const initialState = loadUserState(username);
      if (localStorage.getItem(getStorageKey(username)) === null) {
        localStorage.setItem(getStorageKey(username), JSON.stringify(initialState));
        if (localStorage.getItem(LEGACY_TASKS_KEY) !== null) localStorage.removeItem(LEGACY_TASKS_KEY);
      }
      activateAccount(user, initialState);
      showToast(`Welcome back, ${username}.`);
    }
    authForm.reset();
  } catch (error) {
    setAuthError(error instanceof Error ? error.message : 'We couldn’t complete that request.');
  } finally {
    submit.disabled = false;
  }
}

function signOut() {
  stopTimer();
  sessionStorage.removeItem(SESSION_KEY);
  currentUser = null;
  state = createDefaultState();
  taskSearch.value = '';
  authForm.reset();
  setAuthMode('login');
  appScreen.hidden = true;
  authScreen.hidden = false;
  usernameInput.focus();
}

function formatDate(value, options = { month: 'short', day: 'numeric' }) {
  if (!value) return '';
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, options).format(new Date(year, month - 1, day));
}

function startOfWeekday(date) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date);
}

function taskIsOverdue(task, today = todayKey()) {
  return !task.completed && task.dueDate !== '' && task.dueDate < today;
}

function taskIsToday(task, today = todayKey()) {
  return task.dueDate === today || (!task.dueDate && task.createdAt.slice(0, 10) === today);
}

function completedToday() {
  const today = todayKey();
  return state.tasks.filter(task => task.completed && task.completedAt?.slice(0, 10) === today).length;
}

function getViewTasks() {
  let list = state.tasks.filter(task => {
    if (activeView === 'today') return taskIsToday(task);
    if (activeView === 'upcoming') return !task.completed && task.dueDate > todayKey();
    if (activeView === 'completed') return task.completed;
    if (activeView === 'overdue') return taskIsOverdue(task);
    if (activeView === 'favorites') return task.favorite;
    if (activeView === 'category') return task.category === selectedCategory;
    return true;
  });

  if (activeStatus === 'active') list = list.filter(task => !task.completed);
  if (activeStatus === 'completed') list = list.filter(task => task.completed);
  if (activeStatus === 'overdue') list = list.filter(task => taskIsOverdue(task));
  if (priorityFilter.value !== 'all') list = list.filter(task => task.priority === priorityFilter.value);

  const query = taskSearch.value.trim().toLocaleLowerCase();
  if (query) {
    list = list.filter(task =>
      `${task.title} ${task.description} ${task.category} ${task.priority} ${task.dueDate}`
        .toLocaleLowerCase().includes(query)
    );
  }

  const sort = sortTasks.value;
  return [...list].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    if (sort === 'due') {
      if (!a.dueDate) return b.dueDate ? 1 : b.createdAt.localeCompare(a.createdAt);
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate) || b.createdAt.localeCompare(a.createdAt);
    }
    if (sort === 'priority') {
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.createdAt.localeCompare(a.createdAt);
    }
    if (sort === 'alphabetical') return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    return b.createdAt.localeCompare(a.createdAt);
  });
}

function getCategoryStyle(category) {
  const index = Math.max(0, state.categories.indexOf(category));
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}

function renderTask(task, index, celebrateId) {
  const today = todayKey();
  const overdue = taskIsOverdue(task, today);
  const card = document.createElement('article');
  card.className = `task-card${task.completed ? ' is-completed' : ''}${overdue ? ' is-overdue' : ''}${!task.completed && task.dueDate === today ? ' is-due-today' : ''}${task.id === celebrateId ? ' just-completed' : ''}`;
  card.dataset.taskId = task.id;
  card.style.animationDelay = `${Math.min(index, 8) * 28}ms`;

  const check = document.createElement('button');
  check.className = 'task-check';
  check.type = 'button';
  check.dataset.action = 'toggle';
  check.setAttribute('aria-label', task.completed ? `Mark ${task.title} as active` : `Mark ${task.title} as completed`);
  check.setAttribute('aria-pressed', String(task.completed));

  const copy = document.createElement('div');
  copy.className = 'task-copy';
  const titleRow = document.createElement('div');
  titleRow.className = 'task-title-row';
  const title = document.createElement('h3');
  title.className = 'task-title';
  title.textContent = task.title;
  titleRow.appendChild(title);
  copy.appendChild(titleRow);

  if (task.description) {
    const description = document.createElement('p');
    description.className = 'task-description';
    description.textContent = task.description;
    copy.appendChild(description);
  }

  const meta = document.createElement('div');
  meta.className = 'task-meta';
  const colors = getCategoryStyle(task.category);
  const category = document.createElement('span');
  category.className = 'task-badge category-badge';
  category.style.setProperty('--category-ink', colors.ink);
  category.style.setProperty('--category-pale', colors.pale);
  category.style.setProperty('--category-light', colors.light);
  category.style.setProperty('--category-dark', colors.dark);
  category.textContent = task.category;

  const priority = document.createElement('span');
  priority.className = `task-badge priority-${task.priority}`;
  priority.textContent = `${task.priority[0].toUpperCase()}${task.priority.slice(1)} priority`;
  meta.append(category, priority);

  if (task.dueDate) {
    const due = document.createElement('span');
    due.className = `task-badge date-badge${overdue ? ' is-overdue' : ''}`;
    due.textContent = overdue ? `Overdue · ${formatDate(task.dueDate)}` :
      task.dueDate === today ? 'Due today' : `Due ${formatDate(task.dueDate)}`;
    meta.appendChild(due);
  }
  copy.appendChild(meta);

  const actions = document.createElement('div');
  actions.className = 'task-actions';
  const favorite = document.createElement('button');
  favorite.className = `task-action${task.favorite ? ' favorite' : ''}`;
  favorite.type = 'button';
  favorite.dataset.action = 'favorite';
  favorite.setAttribute('aria-label', task.favorite ? `Remove ${task.title} from favorites` : `Add ${task.title} to favorites`);
  favorite.setAttribute('aria-pressed', String(task.favorite));
  favorite.title = favorite.getAttribute('aria-label');
  favorite.textContent = task.favorite ? '★' : '☆';

  const edit = document.createElement('button');
  edit.className = 'task-action';
  edit.type = 'button';
  edit.dataset.action = 'edit';
  edit.setAttribute('aria-label', `Edit ${task.title}`);
  edit.title = 'Edit task';
  edit.textContent = '✎';

  const remove = document.createElement('button');
  remove.className = 'task-action delete';
  remove.type = 'button';
  remove.dataset.action = 'delete';
  remove.setAttribute('aria-label', `Delete ${task.title}`);
  remove.title = 'Delete task';
  remove.textContent = '×';

  actions.append(favorite, edit, remove);
  card.append(check, copy, actions);
  return card;
}

function setView(view, category = null) {
  activeView = view;
  selectedCategory = category;
  activeStatus = 'all';
  document.querySelectorAll('.filter-chip').forEach(chip => {
    const active = chip.dataset.status === 'all';
    chip.classList.toggle('is-active', active);
    chip.setAttribute('aria-pressed', String(active));
  });
  updateNavigation();
  renderAll();
}

function updateNavigation() {
  const labels = { today: 'Today', upcoming: 'Upcoming', all: 'All tasks', completed: 'Completed', overdue: 'Overdue', favorites: 'Favorites', category: selectedCategory || 'Category' };
  document.getElementById('breadcrumb-view').textContent = labels[activeView] || 'All tasks';
  document.getElementById('tasks-title').textContent = labels[activeView] || 'All tasks';
  document.getElementById('task-list-summary').textContent = activeView === 'today'
    ? 'A few small things for today.'
    : activeView === 'upcoming'
      ? 'Give future you a little head start.'
      : activeView === 'overdue'
        ? 'A fresh start is still a start.'
        : activeView === 'completed'
          ? 'Look at everything you have done.'
          : activeView === 'favorites'
            ? 'The things you want to keep close.'
            : activeView === 'category'
              ? `A little space for ${selectedCategory.toLowerCase()}.`
              : 'Take it one thing at a time.';
  document.querySelectorAll('[data-view]').forEach(button => {
    const active = button.dataset.view === activeView;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
  document.querySelectorAll('[data-category]').forEach(button => {
    const active = activeView === 'category' && button.dataset.category === selectedCategory;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
}

function renderNavigation() {
  const counts = {
    today: state.tasks.filter(task => taskIsToday(task)).length,
    upcoming: state.tasks.filter(task => !task.completed && task.dueDate > todayKey()).length,
    all: state.tasks.length,
    completed: state.tasks.filter(task => task.completed).length,
    overdue: state.tasks.filter(task => taskIsOverdue(task)).length,
    favorites: state.tasks.filter(task => task.favorite).length
  };
  Object.entries(counts).forEach(([key, count]) => {
    const element = document.getElementById(`nav-${key}-count`);
    if (element) element.textContent = String(count);
  });
  document.getElementById('daily-goal').value = String(state.goal);

  const categoryNav = document.getElementById('category-nav');
  categoryNav.replaceChildren(...state.categories.map((category, index) =>
    createCategoryButton(category, index, true)
  ));
  const mobileNav = document.getElementById('mobile-nav');
  const baseLinks = [...document.querySelectorAll('#primary-nav [data-view]')].map(button => {
    const clone = button.cloneNode(true);
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
    return clone;
  });
  const categoryLinks = state.categories.map((category, index) => createCategoryButton(category, index, false));
  mobileNav.replaceChildren(...baseLinks, ...categoryLinks);
  updateNavigation();
  renderTaskCategoryOptions();
}

function createCategoryButton(category, index, allowDelete) {
  const button = document.createElement('button');
  button.className = 'nav-link';
  button.type = 'button';
  button.dataset.category = category;
  const mark = document.createElement('span');
  mark.className = 'category-mark';
  mark.style.setProperty('--category-color', CATEGORY_COLORS[index % CATEGORY_COLORS.length].ink);
  const title = document.createElement('span');
  title.textContent = category;
  button.append(mark, title);
  if (!allowDelete) return button;

  const row = document.createElement('div');
  row.className = 'category-row';
  row.appendChild(button);
  if (allowDelete && !DEFAULT_CATEGORIES.includes(category)) {
    const remove = document.createElement('button');
    remove.className = 'category-delete';
    remove.type = 'button';
    remove.dataset.deleteCategory = category;
    remove.setAttribute('aria-label', `Delete ${category} category`);
    remove.title = 'Delete category';
    remove.textContent = '×';
    row.appendChild(remove);
  }
  return row;
}

function renderTaskCategoryOptions() {
  const select = document.getElementById('task-category');
  const selected = select.value;
  select.replaceChildren(...state.categories.map(category => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    return option;
  }));
  select.value = state.categories.includes(selected) ? selected : state.categories[0];
}

function renderTaskList(celebrateId = null) {
  const visible = getViewTasks();
  taskList.replaceChildren(...visible.map((task, index) => renderTask(task, index, celebrateId)));
  emptyState.hidden = visible.length > 0;
  if (!visible.length) {
    const query = taskSearch.value.trim();
    const scopedView = activeView !== 'all' || activeStatus !== 'all' || priorityFilter.value !== 'all';
    document.getElementById('empty-title').textContent = query
      ? 'No little things found.'
      : scopedView
        ? 'Nothing here just yet.'
        : 'A clear page is a lovely place to start.';
    document.getElementById('empty-description').textContent = query
      ? 'Try another search, or clear your filters.'
      : scopedView
        ? 'Add a task or try another view.'
        : 'Add a task, and give your day a little direction.';
  }
  const completedVisible = visible.some(task => task.completed);
  document.getElementById('clear-completed-button').hidden = !state.tasks.some(task => task.completed);
}

function renderStats() {
  const today = todayKey();
  const total = state.tasks.length;
  const completed = state.tasks.filter(task => task.completed).length;
  const active = total - completed;
  const overdue = state.tasks.filter(task => taskIsOverdue(task, today)).length;
  document.getElementById('total-count').textContent = String(total);
  document.getElementById('completed-count').textContent = String(completed);
  document.getElementById('active-count').textContent = String(active);
  document.getElementById('overdue-count').textContent = String(overdue);

  const completedTodayCount = completedToday();
  const goalPercent = Math.min(100, Math.round((completedTodayCount / state.goal) * 100));
  document.getElementById('goal-progress-label').textContent = `${completedTodayCount} of ${state.goal} done`;
  document.getElementById('goal-progress-percent').textContent = `${goalPercent}%`;
  document.getElementById('goal-progress-fill').style.width = `${goalPercent}%`;
  document.getElementById('goal-track').setAttribute('aria-valuenow', String(goalPercent));

  const percent = total ? Math.round((completed / total) * 100) : 0;
  const ring = document.getElementById('progress-ring');
  ring.style.setProperty('--ring-progress', `${percent}%`);
  ring.setAttribute('aria-valuenow', String(percent));
  document.getElementById('progress-percent').textContent = `${percent}%`;
  document.getElementById('daily-progress-fill').style.width = `${percent}%`;
  document.getElementById('daily-progress-track').setAttribute('aria-valuenow', String(percent));
  document.getElementById('progress-foot').textContent = `${completed} of ${total} ${total === 1 ? 'task' : 'tasks'} complete`;
  document.getElementById('daily-summary').textContent = completedTodayCount
    ? `${completedTodayCount} ${completedTodayCount === 1 ? 'little win' : 'little wins'} today.`
    : 'A fresh page.';
  document.getElementById('motivational-message').textContent = goalPercent >= 100
    ? 'You reached your daily goal. Lovely work!'
    : goalPercent >= 60
      ? 'You’re so close to your little goal.'
      : completedTodayCount
        ? 'Keep going at your own pace.'
        : 'Every little step counts.';
}

function renderDeadlines() {
  const now = new Date();
  const today = todayKey(now);
  const maxDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14);
  const maxKey = todayKey(maxDate);
  const upcoming = state.tasks
    .filter(task => !task.completed && task.dueDate && task.dueDate >= today && task.dueDate <= maxKey)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
    .slice(0, 4);
  const list = document.getElementById('deadline-list');
  if (!upcoming.length) {
    const empty = document.createElement('div');
    empty.className = 'deadline-empty';
    empty.textContent = 'No deadlines on the horizon. Enjoy the breathing room.';
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(...upcoming.map(task => {
    const button = document.createElement('button');
    button.className = 'deadline-item';
    button.type = 'button';
    button.dataset.editTask = task.id;
    const date = document.createElement('span');
    date.className = 'deadline-date';
    const weekday = document.createElement('span');
    weekday.textContent = task.dueDate === today ? 'Today' : startOfWeekday(new Date(`${task.dueDate}T12:00:00`));
    const day = document.createElement('span');
    day.textContent = String(Number(task.dueDate.slice(-2)));
    date.append(weekday, day);
    const copy = document.createElement('span');
    copy.className = 'deadline-copy';
    const title = document.createElement('strong');
    title.textContent = task.title;
    const detail = document.createElement('span');
    detail.textContent = `${task.category} · ${formatDate(task.dueDate, { month: 'short', day: 'numeric' })}`;
    copy.append(title, detail);
    button.append(date, copy);
    return button;
  }));
}

function relativeTime(value) {
  const date = new Date(value);
  const diff = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  if (hours < 48) return 'Yesterday';
  return formatDate(todayKey(date), { month: 'short', day: 'numeric' });
}

function renderActivity() {
  const list = document.getElementById('activity-list');
  if (!state.activity.length) {
    const empty = document.createElement('p');
    empty.className = 'activity-empty';
    empty.textContent = 'Your little wins will show up here.';
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(...state.activity.slice(0, 4).map(entry => {
    const row = document.createElement('div');
    row.className = 'activity-entry';
    const dot = document.createElement('span');
    dot.className = 'activity-dot';
    const content = document.createElement('div');
    const message = document.createElement('p');
    message.textContent = entry.message;
    const time = document.createElement('time');
    time.dateTime = entry.at;
    time.textContent = relativeTime(entry.at);
    content.append(message, time);
    row.append(dot, content);
    return row;
  }));
}

function renderDate() {
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  document.getElementById('current-date').textContent = `${greeting} · ${formatDate(todayKey(), { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}`;
  document.getElementById('page-title').firstChild.textContent = `${greeting}, ${currentUser.username}`;
}

function renderAll(celebrateId = null) {
  if (!currentUser) return;
  renderDate();
  renderNavigation();
  renderTaskList(celebrateId);
  renderStats();
  renderDeadlines();
  renderActivity();
  renderTimer();
}

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#1d221d' : '#f6f6f2';
  themeToggle.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
  themeToggle.title = themeToggle.getAttribute('aria-label');
}

function updateTask(taskId, update, activityMessage) {
  const oldTask = state.tasks.find(task => task.id === taskId);
  if (!oldTask) return;
  const nextTasks = state.tasks.map(task => task.id === taskId ? update(task) : task);
  const activity = activityMessage ? addActivity(activityMessage) : state.activity;
  const nextState = { ...state, tasks: nextTasks, activity };
  const celebrateId = oldTask.completed || !nextTasks.find(task => task.id === taskId).completed ? null : taskId;
  const hadOutstandingTasks = state.tasks.some(task => !task.completed);
  const allNowComplete = nextTasks.length > 0 && nextTasks.every(task => task.completed);
  commit(nextState, celebrateId);
  if (activityMessage) showToast(activityMessage);
  if (allNowComplete && hadOutstandingTasks) celebrate();
}

function openTaskDialog(task = null) {
  editingTaskId = task?.id || null;
  taskForm.reset();
  renderTaskCategoryOptions();
  document.getElementById('task-form-error').hidden = true;
  document.getElementById('task-dialog-title').textContent = task ? 'A little change of plan' : 'What’s on your mind?';
  document.getElementById('save-task-button').innerHTML = task
    ? 'Save my changes <span aria-hidden="true">→</span>'
    : 'Add my task <span aria-hidden="true">→</span>';
  if (task) {
    document.getElementById('task-title').value = task.title;
    document.getElementById('task-description').value = task.description;
    document.getElementById('task-category').value = task.category;
    document.getElementById('task-priority').value = task.priority;
    document.getElementById('task-due-date').value = task.dueDate;
    document.getElementById('task-favorite').checked = task.favorite;
  }
  taskDialog.showModal();
  setTimeout(() => document.getElementById('task-title').focus(), 0);
}

function closeTaskDialog() {
  taskDialog.close();
  editingTaskId = null;
  taskForm.reset();
}

function submitTask(event) {
  event.preventDefault();
  const title = document.getElementById('task-title').value.trim();
  const description = document.getElementById('task-description').value.trim();
  const category = document.getElementById('task-category').value;
  const priority = document.getElementById('task-priority').value;
  const dueDate = document.getElementById('task-due-date').value;
  const favorite = document.getElementById('task-favorite').checked;
  const error = document.getElementById('task-form-error');
  if (!title) {
    error.textContent = 'Give your task a short title to get started.';
    error.hidden = false;
    return;
  }
  if (dueDate && !validDate(dueDate)) {
    error.textContent = 'Choose a real date for your deadline.';
    error.hidden = false;
    return;
  }
  const editing = editingTaskId ? state.tasks.find(task => task.id === editingTaskId) : null;
  const savedTask = editing
    ? { ...editing, title, description, category, priority, dueDate, favorite }
    : {
        id: newId(),
        title,
        description,
        category,
        priority,
        dueDate,
        favorite,
        completed: false,
        completedAt: null,
        createdAt: new Date().toISOString()
      };
  const tasks = editing
    ? state.tasks.map(task => task.id === editing.id ? savedTask : task)
    : [savedTask, ...state.tasks];
  const activity = addActivity(editing ? `Updated “${title}”` : `Added “${title}”`);
  try {
    commit({ ...state, tasks, activity });
    if (activeView !== 'category' || savedTask.category !== selectedCategory) {
      activeView = 'all';
      selectedCategory = null;
      activeStatus = 'all';
      taskSearch.value = '';
      priorityFilter.value = 'all';
      updateNavigation();
      renderTaskList();
    }
    closeTaskDialog();
    showToast(editing ? 'Your task was updated.' : 'Task added successfully!');
  } catch (storageError) {
    error.textContent = storageError instanceof Error ? `Couldn’t save this task: ${storageError.message}` : 'Couldn’t save this task.';
    error.hidden = false;
  }
}

function addQuickTask(title) {
  const cleanTitle = title.trim();
  if (!cleanTitle) return false;
  const task = {
    id: newId(),
    title: cleanTitle,
    description: '',
    category: selectedCategory && state.categories.includes(selectedCategory) ? selectedCategory : 'College',
    priority: 'medium',
    dueDate: '',
    favorite: false,
    completed: false,
    completedAt: null,
    createdAt: new Date().toISOString()
  };
  try {
    commit({ ...state, tasks: [task, ...state.tasks], activity: addActivity(`Added “${cleanTitle}”`) });
    activeView = 'all';
    activeStatus = 'all';
    selectedCategory = null;
    taskSearch.value = '';
    priorityFilter.value = 'all';
    updateNavigation();
    renderTaskList();
    showToast('Task added successfully!');
    return true;
  } catch (error) {
    showToast(error instanceof Error ? `Couldn’t save the task: ${error.message}` : 'Couldn’t save the task.', true);
    return false;
  }
}

function askConfirmation({ title, message, acceptLabel, danger = false, action }) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;
  const accept = document.getElementById('confirm-accept');
  accept.textContent = acceptLabel;
  accept.classList.toggle('button-danger', danger);
  accept.classList.toggle('button-primary', !danger);
  confirmAction = action;
  confirmDialog.showModal();
}

function handleConfirm() {
  const action = confirmAction;
  confirmAction = null;
  confirmDialog.close();
  if (action) action();
}

function deleteTask(task) {
  askConfirmation({
    title: 'Let this one go?',
    message: `“${task.title}” will be removed from your list.`,
    acceptLabel: 'Delete task',
    danger: true,
    action: () => {
      const tasks = state.tasks.filter(item => item.id !== task.id);
      const activity = addActivity(`Removed “${task.title}”`);
      try {
        commit({ ...state, tasks, activity });
        showToast('Task deleted.');
      } catch (error) {
        showToast(error instanceof Error ? `Couldn’t delete task: ${error.message}` : 'Couldn’t delete the task.', true);
      }
    }
  });
}

function handleTaskAction(event) {
  const action = event.target.closest('[data-action]');
  if (!action) return;
  const card = action.closest('[data-task-id]');
  const task = state.tasks.find(item => item.id === card?.dataset.taskId);
  if (!task) return;

  if (action.dataset.action === 'edit') {
    openTaskDialog(task);
    return;
  }
  if (action.dataset.action === 'delete') {
    deleteTask(task);
    return;
  }
  if (action.dataset.action === 'toggle') {
    const completed = !task.completed;
    const updated = {
      ...task,
      completed,
      completedAt: completed ? new Date().toISOString() : null
    };
    updateTask(task.id, () => updated, completed ? `Completed “${task.title}”` : `Reopened “${task.title}”`);
    return;
  }
  if (action.dataset.action === 'favorite') {
    const favorite = !task.favorite;
    updateTask(task.id, current => ({ ...current, favorite }), favorite ? `Saved “${task.title}” as a favorite` : `Removed “${task.title}” from favorites`);
  }
}

function clearCompleted() {
  const completed = state.tasks.filter(task => task.completed);
  if (!completed.length) return;
  askConfirmation({
    title: 'Clear your finished tasks?',
    message: `${completed.length} completed ${completed.length === 1 ? 'task will' : 'tasks will'} be removed. This cannot be undone.`,
    acceptLabel: 'Clear completed',
    danger: true,
    action: () => {
      try {
        commit({
          ...state,
          tasks: state.tasks.filter(task => !task.completed),
          activity: addActivity(`Cleared ${completed.length} completed ${completed.length === 1 ? 'task' : 'tasks'}`)
        });
        showToast('Your completed tasks have been cleared.');
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Couldn’t clear completed tasks.', true);
      }
    }
  });
}

function resetTasks() {
  if (!state.tasks.length) {
    showToast('Your task list is already clear.');
    return;
  }
  askConfirmation({
    title: 'Start with a blank page?',
    message: 'This removes every task from your list. Your categories and preferences will stay.',
    acceptLabel: 'Reset all tasks',
    danger: true,
    action: () => {
      try {
        commit({ ...state, tasks: [], activity: addActivity('Started with a fresh task list') });
        showToast('Your list is clear. A fresh start.');
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Couldn’t reset your tasks.', true);
      }
    }
  });
}

function renderTimer() {
  const timer = document.getElementById('focus-timer');
  const minutes = Math.floor(timerSeconds / 60).toString().padStart(2, '0');
  const seconds = (timerSeconds % 60).toString().padStart(2, '0');
  timer.textContent = `${minutes}:${seconds}`;
  timer.dateTime = `PT${minutes}M${seconds}S`;
  document.getElementById('timer-mode').textContent = timerMode === 'focus' ? 'FOCUS SESSION' : 'A LITTLE BREAK';
  document.getElementById('focus-subtitle').textContent = timerMode === 'focus' ? 'One thing. Twenty-five minutes.' : 'Take a breath. You earned five.';
  document.getElementById('timer-start').textContent = timerRunning ? 'Take a pause' : timerMode === 'focus' ? 'Start focusing' : 'Start my break';
  document.getElementById('focus-count').textContent = `${state.focusSessions} focus ${state.focusSessions === 1 ? 'session' : 'sessions'} today`;
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  timerRunning = false;
}

function finishTimerPhase() {
  stopTimer();
  const finishedFocus = timerMode === 'focus';
  if (finishedFocus) {
    const sessionDate = todayKey();
    const focusSessions = state.focusSessionDate === sessionDate ? state.focusSessions + 1 : 1;
    try {
      commit({ ...state, focusSessionDate: sessionDate, focusSessions, activity: addActivity('Finished a focus session') });
    } catch (error) {
      showToast(error instanceof Error ? `Couldn’t save your focus session: ${error.message}` : 'Couldn’t save your focus session.', true);
    }
  }
  timerMode = finishedFocus ? 'break' : 'focus';
  timerSeconds = finishedFocus ? 5 * 60 : 25 * 60;
  renderTimer();
  showToast(finishedFocus ? 'Focus session complete. Enjoy a five-minute break!' : 'Break is over. Ready when you are!');
}

function toggleTimer() {
  if (timerRunning) {
    stopTimer();
    renderTimer();
    return;
  }
  timerRunning = true;
  renderTimer();
  timerInterval = setInterval(() => {
    timerSeconds -= 1;
    if (timerSeconds <= 0) {
      timerSeconds = 0;
      finishTimerPhase();
      return;
    }
    renderTimer();
  }, 1000);
}

function resetTimer() {
  stopTimer();
  timerMode = 'focus';
  timerSeconds = 25 * 60;
  renderTimer();
}

function celebrate() {
  const layer = document.getElementById('confetti-layer');
  const colors = ['#89a477', '#d8b36c', '#c98573', '#8da8ae', '#b49bc2', '#a8be92'];
  layer.replaceChildren();
  for (let index = 0; index < 40; index += 1) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.style.left = `${8 + Math.random() * 84}%`;
    piece.style.setProperty('--piece-x', `${Math.round((Math.random() - .5) * 300)}px`);
    piece.style.setProperty('--piece-y', `${140 + Math.random() * 300}px`);
    piece.style.setProperty('--piece-turn', `${Math.round(Math.random() * 900 - 450)}deg`);
    piece.style.setProperty('--piece-color', colors[index % colors.length]);
    piece.style.setProperty('--piece-size', `${5 + Math.random() * 6}px`);
    piece.style.setProperty('--piece-duration', `${.8 + Math.random() * .9}s`);
    layer.appendChild(piece);
  }
  window.setTimeout(() => layer.replaceChildren(), 1900);
  showToast('You did it! Every task, taken care of. ✨');
}

function addCategory(name) {
  const category = name.trim().replace(/\s+/g, ' ');
  const error = document.getElementById('category-form-error');
  if (!category) {
    error.textContent = 'Give your category a name first.';
    error.hidden = false;
    return;
  }
  if (state.categories.some(item => item.toLocaleLowerCase() === category.toLocaleLowerCase())) {
    error.textContent = 'That category already has a home here.';
    error.hidden = false;
    return;
  }
  try {
    commit({ ...state, categories: [...state.categories, category], activity: addActivity(`Created the “${category}” category`) });
    categoryDialog.close();
    document.getElementById('category-form').reset();
    showToast(`“${category}” category added.`);
  } catch (storageError) {
    error.textContent = storageError instanceof Error ? storageError.message : 'Couldn’t save your category.';
    error.hidden = false;
  }
}

function removeCategory(category) {
  if (DEFAULT_CATEGORIES.includes(category)) return;
  askConfirmation({
    title: `Remove “${category}”?`,
    message: 'Its tasks will move to College. This won’t delete any of your tasks.',
    acceptLabel: 'Remove category',
    danger: true,
    action: () => {
      const tasks = state.tasks.map(task => task.category === category ? { ...task, category: 'College' } : task);
      try {
        commit({
          ...state,
          categories: state.categories.filter(item => item !== category),
          tasks,
          activity: addActivity(`Removed the “${category}” category`)
        });
        if (activeView === 'category' && selectedCategory === category) setView('all');
        showToast(`“${category}” removed. Its tasks are safe in College.`);
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Couldn’t remove the category.', true);
      }
    }
  });
}

function setGoal(goal) {
  try {
    commit({ ...state, goal });
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Couldn’t save your daily goal.', true);
  }
}

function initialize() {
  loginTab.addEventListener('click', () => setAuthMode('login'));
  registerTab.addEventListener('click', () => setAuthMode('register'));
  authForm.addEventListener('submit', handleAuth);
  document.getElementById('signout-button').addEventListener('click', signOut);

  document.getElementById('primary-nav').addEventListener('click', event => {
    const button = event.target.closest('[data-view]');
    if (button) setView(button.dataset.view);
  });
  document.getElementById('category-nav').addEventListener('click', event => {
    const deleteButton = event.target.closest('[data-delete-category]');
    if (deleteButton) {
      event.stopPropagation();
      removeCategory(deleteButton.dataset.deleteCategory);
      return;
    }
    const button = event.target.closest('[data-category]');
    if (button) setView('category', button.dataset.category);
  });
  document.getElementById('mobile-nav').addEventListener('click', event => {
    const button = event.target.closest('[data-view], [data-category]');
    if (!button) return;
    if (button.dataset.view) setView(button.dataset.view);
    else setView('category', button.dataset.category);
  });

  document.getElementById('open-task-dialog').addEventListener('click', () => openTaskDialog());
  document.getElementById('empty-add-button').addEventListener('click', () => openTaskDialog());
  document.querySelectorAll('[data-close-task-dialog]').forEach(button => button.addEventListener('click', closeTaskDialog));
  taskForm.addEventListener('submit', submitTask);
  taskDialog.addEventListener('click', event => {
    if (event.target === taskDialog) closeTaskDialog();
  });
  taskList.addEventListener('click', handleTaskAction);
  taskList.addEventListener('click', event => {
    const deadline = event.target.closest('[data-edit-task]');
    if (!deadline) return;
    const task = state.tasks.find(item => item.id === deadline.dataset.editTask);
    if (task) openTaskDialog(task);
  });

  document.getElementById('quick-add-form').addEventListener('submit', event => {
    event.preventDefault();
    const input = document.getElementById('quick-add-input');
    if (addQuickTask(input.value)) input.value = '';
  });
  taskSearch.addEventListener('input', renderTaskList);
  priorityFilter.addEventListener('change', renderTaskList);
  sortTasks.addEventListener('change', renderTaskList);
  document.querySelectorAll('[data-status]').forEach(button => {
    button.addEventListener('click', () => {
      activeStatus = button.dataset.status;
      document.querySelectorAll('[data-status]').forEach(chip => {
        const active = chip === button;
        chip.classList.toggle('is-active', active);
        chip.setAttribute('aria-pressed', String(active));
      });
      renderTaskList();
    });
  });

  document.getElementById('clear-completed-button').addEventListener('click', clearCompleted);
  document.getElementById('reset-tasks-button').addEventListener('click', resetTasks);
  document.getElementById('daily-goal').addEventListener('change', event => setGoal(Number(event.target.value)));
  themeToggle.addEventListener('click', () => {
    const theme = state.theme === 'dark' ? 'light' : 'dark';
    try {
      persist({ ...state, theme });
      applyTheme(theme);
      themeToggle.classList.remove('theme-changing');
      void themeToggle.offsetWidth;
      themeToggle.classList.add('theme-changing');
      window.setTimeout(() => themeToggle.classList.remove('theme-changing'), 450);
    } catch (error) {
      showToast(error instanceof Error ? `Couldn’t save the theme: ${error.message}` : 'Couldn’t save the theme.', true);
    }
  });

  document.getElementById('timer-start').addEventListener('click', toggleTimer);
  document.getElementById('timer-reset').addEventListener('click', resetTimer);
  document.getElementById('add-category-button').addEventListener('click', () => {
    document.getElementById('category-form-error').hidden = true;
    categoryDialog.showModal();
    document.getElementById('category-name').focus();
  });
  document.querySelectorAll('[data-close-category-dialog]').forEach(button => {
    button.addEventListener('click', () => categoryDialog.close());
  });
  document.getElementById('category-form').addEventListener('submit', event => {
    event.preventDefault();
    addCategory(document.getElementById('category-name').value);
  });

  document.getElementById('confirm-cancel').addEventListener('click', () => {
    confirmAction = null;
    confirmDialog.close();
  });
  document.getElementById('confirm-accept').addEventListener('click', handleConfirm);
  document.getElementById('confirm-accept').addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleConfirm();
    }
  });

  applyTheme('light');
  document.getElementById('task-due-date').min = todayKey();

  try {
    users = validateUsers(JSON.parse(localStorage.getItem(USERS_KEY) || '[]'));
    const savedUsername = sessionStorage.getItem(SESSION_KEY);
    const savedUser = users.find(user => user.username === savedUsername);
    if (savedUser) activateAccount(savedUser, loadUserState(savedUser.username));
    else if (savedUsername) sessionStorage.removeItem(SESSION_KEY);
  } catch (error) {
    setAuthError(error instanceof Error ? error.message : 'Saved account data could not be read.');
  }
}

initialize();
