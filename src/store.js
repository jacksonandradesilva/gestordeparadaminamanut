import { createClient } from '@supabase/supabase-js';

const STORAGE_KEY = 'mina_status_store_v1';
const TABLE_NAME = 'app_state';
const AUDIT_TABLE_NAME = 'audit_logs';
const ADMIN_TABLE_NAME = 'admin_users';
const ACCESS_TABLE_NAME = 'user_access';
const STATE_ID = 'global';

export const PAGE_ACCESS_KEYS = [
  'dashboard',
  'historico',
  'relatorio-turnos',
  'relatorio-equipe-eletrica',
  'historico-opcoes',
  'dashboard-turnos',
  'agente-ia',
  'status-treinamentos',
  'colaboradores'
];

const RELATORIO_EQUIPE_ELETRICA_KEY = '__relatorio_equipe_eletrica__';
const CADASTROS_BASE_KEY = '__cadastros_base__';

function sanitizeAllowedPages(allowedPages) {
  if (!Array.isArray(allowedPages)) {
    return [];
  }

  const allowed = new Set(PAGE_ACCESS_KEYS);

  return [...new Set(
    allowedPages
      .map((item) => String(item || '').trim())
      .filter((item) => allowed.has(item))
  )];
}

function getUserStorageKey(userId) {
  return `${STORAGE_KEY}_${userId}`;
}

function normalizeSupabaseUrl(url) {
  if (!url) {
    return '';
  }

  return url
    .trim()
    .replace(/\/rest\/v1\/?$/i, '')
    .replace(/\/$/, '');
}

const SUPABASE_URL = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const AUTORIZED_ADMIN_EMAILS = new Set(['jacksonandradesilva33@gmail.com']);
const hasRemoteConfig = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const storageMode = hasRemoteConfig ? 'supabase' : 'local';

function isAutoAdminEmail(email) {
  return typeof email === 'string' && AUTORIZED_ADMIN_EMAILS.has(email.trim().toLowerCase());
}

let hasLoggedModeNotice = false;

function logStorageModeNotice() {
  if (hasLoggedModeNotice) {
    return;
  }

  hasLoggedModeNotice = true;

  if (hasRemoteConfig) {
    return;
  }

  const missing = [];

  if (!SUPABASE_URL) {
    missing.push('VITE_SUPABASE_URL');
  }

  if (!SUPABASE_ANON_KEY) {
    missing.push('VITE_SUPABASE_ANON_KEY');
  }

  console.warn(
    `Supabase desativado. O app esta usando apenas localStorage. Defina as variaveis ${missing.join(', ')} no ambiente de deploy (ex.: Vercel).`
  );
}

const supabase = hasRemoteConfig
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

logStorageModeNotice();

async function requireAuthenticatedUser() {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  if (!data?.user) {
    throw new Error('Usuario nao autenticado. Faca login para acessar os dados.');
  }

  return data.user;
}

export function isAuthEnabled() {
  return Boolean(supabase);
}

export async function getCurrentSession() {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  return data.session;
}

export function subscribeAuthChanges(callback) {
  if (!supabase) {
    return () => {};
  }

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });

  return () => {
    data.subscription.unsubscribe();
  };
}

export async function signInWithPassword(email, password) {
  if (!supabase) {
    throw new Error('Supabase nao configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    throw error;
  }

  await writeAuditLog('auth_login_sucesso', {
    descricao: 'Usuario autenticou com e-mail e senha.'
  });

  return data.session;
}

export async function signUpWithPassword(email, password) {
  if (!supabase) {
    throw new Error('Supabase nao configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
  }

  const emailRedirectTo = typeof window !== 'undefined'
    ? window.location.origin
    : undefined;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo
    }
  });

  if (error) {
    const message = String(error?.message || '').toLowerCase();

    if (message.includes('rate limit') || message.includes('too many requests')) {
      throw new Error('Limite de envio de e-mail atingido. Aguarde alguns minutos e tente novamente, ou crie a conta mais tarde.');
    }

    throw error;
  }

  await writeAuditLog('auth_conta_criada', {
    descricao: 'Nova conta criada com e-mail e senha.'
  });

  return data;
}

export async function signOut() {
  if (!supabase) {
    return;
  }

  const {
    data: { user }
  } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));

  if (user?.id) {
    await writeAuditLog('auth_logout', {
      descricao: 'Usuario encerrou a sessao.'
    });

    window.localStorage.removeItem(getUserStorageKey(user.id));
  }

  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
}

export function getStorageStatus() {
  return {
    mode: storageMode,
    hasRemoteConfig,
    authEnabled: Boolean(supabase),
    supabaseUrl: SUPABASE_URL,
    missingEnvVars: [
      ...(SUPABASE_URL ? [] : ['VITE_SUPABASE_URL']),
      ...(SUPABASE_ANON_KEY ? [] : ['VITE_SUPABASE_ANON_KEY'])
    ]
  };
}

export async function getIsCurrentUserAdmin() {
  if (!supabase) {
    return false;
  }

  const user = await requireAuthenticatedUser();

  if (isAutoAdminEmail(user.email)) {
    return true;
  }

  const { data, error } = await supabase
    .from(ADMIN_TABLE_NAME)
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data?.user_id);
}

export async function ensureCurrentUserAccessRequest() {
  if (!supabase) {
    return null;
  }

  const user = await requireAuthenticatedUser();

  if (isAutoAdminEmail(user.email)) {
    return user;
  }

  const { error } = await supabase
    .from(ACCESS_TABLE_NAME)
    .upsert({
      user_id: user.id,
      email: user.email || null,
      status: 'pending',
      allowed_pages: [],
      approved_at: null,
      approved_by: null,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id',
      ignoreDuplicates: true
    });

  if (error) {
    throw error;
  }

  return user;
}

export async function getCurrentUserAccessProfile() {
  if (!supabase) {
    return {
      user_id: null,
      email: null,
      status: 'approved'
    };
  }

  const user = await ensureCurrentUserAccessRequest();

  if (isAutoAdminEmail(user.email)) {
    return {
      user_id: user.id,
      email: user.email || null,
      status: 'approved',
      allowed_pages: [...PAGE_ACCESS_KEYS],
      approved_at: new Date().toISOString(),
      approved_by: user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  const { data, error } = await supabase
    .from(ACCESS_TABLE_NAME)
    .select('user_id, email, status, allowed_pages, approved_at, approved_by, created_at, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || {
    user_id: user.id,
    email: user.email || null,
    status: 'pending',
    allowed_pages: [],
    approved_at: null,
    approved_by: null,
    created_at: null,
    updated_at: null
  };
}

export async function fetchManagedUserAccesses() {
  if (!supabase) {
    return [];
  }

  const isAdmin = await getIsCurrentUserAdmin();

  if (!isAdmin) {
    throw new Error('Acesso negado. Somente administrador pode gerenciar liberacoes.');
  }

  const { data, error } = await supabase
    .from(ACCESS_TABLE_NAME)
    .select('user_id, email, status, allowed_pages, approved_at, approved_by, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

export async function updateUserAccessStatus(targetUserId, status, allowedPages = null) {
  if (!supabase) {
    return null;
  }

  const isAdmin = await getIsCurrentUserAdmin();

  if (!isAdmin) {
    throw new Error('Acesso negado. Somente administrador pode liberar usuarios.');
  }

  if (!targetUserId) {
    throw new Error('Usuario alvo nao informado.');
  }

  if (!['pending', 'approved'].includes(status)) {
    throw new Error('Status de acesso invalido.');
  }

  const adminUser = await requireAuthenticatedUser();
  const isApproved = status === 'approved';
  const safeAllowedPages = sanitizeAllowedPages(allowedPages);

  const payload = {
    user_id: targetUserId,
    status,
    allowed_pages: isApproved
      ? (safeAllowedPages.length > 0 ? safeAllowedPages : PAGE_ACCESS_KEYS)
      : (safeAllowedPages.length > 0 ? safeAllowedPages : []),
    approved_at: isApproved ? new Date().toISOString() : null,
    approved_by: isApproved ? adminUser.id : null,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from(ACCESS_TABLE_NAME)
    .upsert(payload, { onConflict: 'user_id' })
    .select('user_id, email, status, allowed_pages, approved_at, approved_by, created_at, updated_at')
    .maybeSingle();

  if (error) {
    throw error;
  }

  await writeAuditLog(isApproved ? 'admin_liberou_usuario' : 'admin_retorno_usuario_para_pendente', {
    usuarioAlvo: targetUserId,
    status
  });

  return data;
}

export async function updateUserAccessPermissions(targetUserId, allowedPages) {
  if (!supabase) {
    return null;
  }

  const isAdmin = await getIsCurrentUserAdmin();

  if (!isAdmin) {
    throw new Error('Acesso negado. Somente administrador pode ajustar paginas liberadas.');
  }

  if (!targetUserId) {
    throw new Error('Usuario alvo nao informado.');
  }

  const safeAllowedPages = sanitizeAllowedPages(allowedPages);

  const { data, error } = await supabase
    .from(ACCESS_TABLE_NAME)
    .upsert({
      user_id: targetUserId,
      allowed_pages: safeAllowedPages,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' })
    .select('user_id, email, status, allowed_pages, approved_at, approved_by, created_at, updated_at')
    .maybeSingle();

  if (error) {
    throw error;
  }

  await writeAuditLog('admin_atualizou_paginas_usuario', {
    usuarioAlvo: targetUserId,
    paginasLiberadas: safeAllowedPages
  });

  return data;
}

export async function deleteUserAccess(targetUserId) {
  if (!supabase) {
    return false;
  }

  const isAdmin = await getIsCurrentUserAdmin();

  if (!isAdmin) {
    throw new Error('Acesso negado. Somente administrador pode excluir cadastro de acesso.');
  }

  if (!targetUserId) {
    throw new Error('Usuario alvo nao informado.');
  }

  const { data: deletedRows, error } = await supabase
    .from(ACCESS_TABLE_NAME)
    .delete()
    .eq('user_id', targetUserId)
    .select('user_id');

  if (error) {
    throw error;
  }

  const removed = Array.isArray(deletedRows) && deletedRows.length > 0;

  if (removed) {
    await writeAuditLog('admin_excluiu_cadastro_acesso_usuario', {
      usuarioAlvo: targetUserId
    });
  }

  return removed;
}

export async function uploadCollaboratorPhoto(file, collaboratorName = 'colaborador') {
  if (!supabase) {
    throw new Error('Supabase nao configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
  }

  if (!file) {
    throw new Error('Selecione uma imagem antes de continuar.');
  }

  if (!file.type || !file.type.startsWith('image/')) {
    throw new Error('O arquivo selecionado deve ser uma imagem.');
  }

  const safeName = String(collaboratorName || 'colaborador')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'colaborador';

  const extension = (file.name?.split('.').pop() || 'png').toLowerCase();
  const fileName = `${safeName}-${Date.now()}.${extension}`;
  const path = `treinamentos/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('colaborador-fotos')
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'image/png'
    });

  if (uploadError) {
    const message = String(uploadError?.message || '').toLowerCase();

    if (message.includes('bucket') && message.includes('not found')) {
      throw new Error('Crie o bucket "colaborador-fotos" no Supabase Storage antes de enviar a imagem.');
    }

    throw new Error(uploadError?.message || 'Nao foi possivel enviar a imagem para o armazenamento.');
  }

  const { data } = supabase.storage
    .from('colaborador-fotos')
    .getPublicUrl(path);

  if (!data?.publicUrl) {
    throw new Error('Nao foi possivel obter a URL publica da imagem.');
  }

  return data.publicUrl;
}

export async function writeAuditLog(action, details = {}) {
  if (!supabase) {
    return;
  }

  try {
    const user = await requireAuthenticatedUser();

    const { error } = await supabase
      .from(AUDIT_TABLE_NAME)
      .insert({
        actor_id: user.id,
        actor_email: user.email || null,
        action,
        details: details && typeof details === 'object' ? details : { valor: String(details || '') }
      });

    if (error) {
      throw error;
    }
  } catch (error) {
    console.warn('Falha ao registrar log de auditoria:', error);
  }
}

export async function fetchAuditLogs(limit = 200) {
  if (!supabase) {
    return [];
  }

  const isAdmin = await getIsCurrentUserAdmin();

  if (!isAdmin) {
    throw new Error('Acesso negado. Somente administrador pode visualizar auditoria.');
  }

  const { data, error } = await supabase
    .from(AUDIT_TABLE_NAME)
    .select('id, created_at, actor_id, actor_email, action, details')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

export async function clearAccessAuditLogs() {
  if (!supabase) {
    return 0;
  }

  const isAdmin = await getIsCurrentUserAdmin();

  if (!isAdmin) {
    throw new Error('Acesso negado. Somente administrador pode limpar acessos.');
  }

  const accessActions = [
    'auth_login_sucesso',
    'auth_logout',
    'admin_visualizou_auditoria'
  ];

  const { data, error } = await supabase
    .from(AUDIT_TABLE_NAME)
    .delete()
    .in('action', accessActions)
    .select('id');

  if (error) {
    throw error;
  }

  await writeAuditLog('admin_limpou_acessos', {
    totalRemovido: Array.isArray(data) ? data.length : 0
  });

  return Array.isArray(data) ? data.length : 0;
}

export async function clearAllAuditLogs() {
  if (!supabase) {
    return 0;
  }

  const isAdmin = await getIsCurrentUserAdmin();

  if (!isAdmin) {
    throw new Error('Acesso negado. Somente administrador pode limpar a auditoria.');
  }

  const { data: auditsDeleted, error: auditError } = await supabase
    .from(AUDIT_TABLE_NAME)
    .delete()
    .not('id', 'is', null)
    .select('id');

  if (auditError) {
    throw auditError;
  }

  return Array.isArray(auditsDeleted) ? auditsDeleted.length : 0;
}
// Funções auxiliares para manipulação do estado
function getEmptyState() {
  return {
    equipamentos: [],
    historicoParadas: [],
    relatorioTurnosNotas: {},
    treinamentos: [],
    colaboradores: []
  };
}
// Clona o objeto relatorioTurnosNotas para evitar mutações externas
function cloneRelatorioTurnosNotas(notas) {
  if (!notas || typeof notas !== 'object' || Array.isArray(notas)) {
    return {};
  }

  return { ...notas };
}

function getEmptyRelatorioEquipeEletrica() {
  return [];
}

function cloneRelatorioEquipeEletrica(list) {
  if (!Array.isArray(list)) {
    return [];
  }

  function getEmptyDescricaoAtividade() {
    return {
      descricao: '',
      equipamento: '',
      tagEquipamento: '',
      tipoServico: '',
      ordemServico: ''
    };
  }

  function normalizeTurno(value) {
    const safe = String(value || '').trim().toUpperCase();
    return ['A', 'B', 'C', 'D'].includes(safe) ? safe : '';
  }

  function normalizeTurma(value) {
    const safe = String(value || '').trim().toUpperCase();
    return ['A', 'B', 'C', 'D', 'E'].includes(safe) ? safe : '';
  }

  function normalizeExecutantesList(value) {
    if (Array.isArray(value)) {
      return [...new Set(
        value
          .map((item) => String(item || '').trim())
          .filter(Boolean)
      )];
    }

    return [...new Set(
      String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    )];
  }

  function normalizeFerramentasList(value) {
    if (Array.isArray(value)) {
      return [...new Set(
        value
          .map((item) => String(item || '').trim())
          .filter(Boolean)
      )];
    }

    return [...new Set(
      String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    )];
  }

  function normalizeVeiculosList(value) {
    if (Array.isArray(value)) {
      return [...new Set(
        value
          .map((item) => String(item || '').trim())
          .filter(Boolean)
      )];
    }

    return [...new Set(
      String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    )];
  }

  function normalizeDescricaoAtividadesList(value) {
    function toSafeItem(item) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        return {
          descricao: String(item.descricao || item.texto || '').trim(),
          equipamento: String(item.equipamento || '').trim(),
          tagEquipamento: String(item.tagEquipamento || item.tag || '').trim(),
          tipoServico: String(item.tipoServico || item.tipoDeServico || '').trim(),
          ordemServico: String(item.ordemServico || item.os || '').trim()
        };
      }

      return {
        ...getEmptyDescricaoAtividade(),
        descricao: String(item || '').trim()
      };
    }

    if (Array.isArray(value)) {
      const cleaned = value
        .map((item) => toSafeItem(item))
        .filter((item) => (
          item.descricao
          || item.equipamento
          || item.tagEquipamento
          || item.tipoServico
          || item.ordemServico
        ));

      return cleaned.length > 0 ? cleaned : [getEmptyDescricaoAtividade()];
    }

    if (value && typeof value === 'object') {
      const item = toSafeItem(value);
      const hasAnyValue = item.descricao
        || item.equipamento
        || item.tagEquipamento
        || item.tipoServico
        || item.ordemServico;

      return hasAnyValue ? [item] : [getEmptyDescricaoAtividade()];
    }

    const single = String(value || '').trim();
    return single
      ? [{ ...getEmptyDescricaoAtividade(), descricao: single }]
      : [getEmptyDescricaoAtividade()];
  }

  function normalizeDescricaoAtividade(value) {
    return normalizeDescricaoAtividadesList(value)
      .map((item) => item.descricao)
      .filter(Boolean)
      .join('\n');
  }

  return list
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const descricaoAtividades = normalizeDescricaoAtividadesList(
        item.descricaoAtividades || item.descricaoAtividade || item.atividades || ''
      );

      return {
        id: Number(item.id) || Date.now(),
        dataRelatorio: String(item.dataRelatorio || ''),
        turno: normalizeTurno(item.turno),
        turma: normalizeTurma(item.turma),
        liderTecnico: String(item.liderTecnico || item.encarregado || '').trim(),
        descricaoAtividades,
        descricaoAtividade: normalizeDescricaoAtividade(descricaoAtividades),
        executantes: normalizeExecutantesList(item.executantes || item.eletricistas || ''),
        ferramentas: normalizeFerramentasList(item.ferramentas),
        veiculos: normalizeVeiculosList(item.veiculos)
      };
    });
}

function getRelatorioEquipeEletricaFromNotas(notas) {
  const safeNotas = cloneRelatorioTurnosNotas(notas);
  const raw = safeNotas[RELATORIO_EQUIPE_ELETRICA_KEY];

  if (!Array.isArray(raw)) {
    return getEmptyRelatorioEquipeEletrica();
  }

  return cloneRelatorioEquipeEletrica(raw);
}

function mergeRelatorioEquipeEletricaIntoNotas(notas, relatorios) {
  const safeNotas = cloneRelatorioTurnosNotas(notas);
  safeNotas[RELATORIO_EQUIPE_ELETRICA_KEY] = cloneRelatorioEquipeEletrica(relatorios);
  return safeNotas;
}

function getEmptyCadastrosBase() {
  return {
    colaboradores: [],
    lideresTecnicos: [],
    ferramentas: [],
    veiculos: []
  };
}

function normalizeCadastroList(list) {
  if (!Array.isArray(list)) {
    return [];
  }

  return [...new Set(
    list
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
}

function cloneCadastrosBase(cadastros) {
  const base = cadastros && typeof cadastros === 'object' ? cadastros : {};

  return {
    colaboradores: normalizeCadastroList(base.colaboradores),
    lideresTecnicos: normalizeCadastroList(base.lideresTecnicos),
    ferramentas: normalizeCadastroList(base.ferramentas),
    veiculos: normalizeCadastroList(base.veiculos)
  };
}

function getCadastrosBaseFromNotas(notas) {
  const safeNotas = cloneRelatorioTurnosNotas(notas);
  const raw = safeNotas[CADASTROS_BASE_KEY];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return getEmptyCadastrosBase();
  }

  return cloneCadastrosBase(raw);
}

function mergeCadastrosBaseIntoNotas(notas, cadastrosBase) {
  const safeNotas = cloneRelatorioTurnosNotas(notas);
  safeNotas[CADASTROS_BASE_KEY] = cloneCadastrosBase(cadastrosBase);
  return safeNotas;
}
// Clona o estado para evitar mutações externas
function cloneState(state) {
  return {
    equipamentos: Array.isArray(state?.equipamentos) ? [...state.equipamentos] : [],
    historicoParadas: Array.isArray(state?.historicoParadas) ? [...state.historicoParadas] : [],
    relatorioTurnosNotas: cloneRelatorioTurnosNotas(state?.relatorioTurnosNotas),
    treinamentos: Array.isArray(state?.treinamentos) ? [...state.treinamentos] : [],
    colaboradores: Array.isArray(state?.colaboradores) ? [...state.colaboradores] : []
  };
}
// Lê o estado do localStorage, retornando um estado vazio em caso de erro
function readLocalState(storageKey = STORAGE_KEY) {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return getEmptyState();
    }

    const parsed = JSON.parse(raw);
    return cloneState(parsed || {});
  } catch (error) {
    console.error('Falha ao ler dados locais:', error);
    return getEmptyState();
  }
}
// Escreve o estado no localStorage, retornando o estado seguro
function writeLocalState(state, storageKey = STORAGE_KEY) {
  const safeState = cloneState(state || {});
  window.localStorage.setItem(storageKey, JSON.stringify(safeState));
  return safeState;
}

export async function getState() {
  if (!supabase) {
    return readLocalState();
  }

  try {
    const user = await requireAuthenticatedUser();

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('equipamentos, historico_paradas, relatorio_turnos_notas, treinamentos, colaboradores')
      .eq('id', STATE_ID)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      const emptyState = getEmptyState();
      await saveState(emptyState, user);
      return emptyState;
    }

    const remoteState = cloneState({
      equipamentos: data.equipamentos,
      historicoParadas: data.historico_paradas,
      relatorioTurnosNotas: data.relatorio_turnos_notas,
      treinamentos: data.treinamentos,
      colaboradores: data.colaboradores
    });

    writeLocalState(remoteState);
    return remoteState;
  } catch (error) {
    console.error('Falha ao ler dados remotos, usando cache local:', error);
    return readLocalState();
  }
}

export async function saveState(state, authenticatedUser = null) {
  const incomingState = state && typeof state === 'object' ? state : {};
  let user = null;
  const storageKey = STORAGE_KEY;

  if (supabase) {
    user = authenticatedUser || await requireAuthenticatedUser();
  }

  const currentState = readLocalState(storageKey);

  // Mescla com o estado atual para evitar perda de campos em atualizacoes parciais.
  const mergedState = {
    equipamentos: Object.prototype.hasOwnProperty.call(incomingState, 'equipamentos')
      ? incomingState.equipamentos
      : currentState.equipamentos,
    historicoParadas: Object.prototype.hasOwnProperty.call(incomingState, 'historicoParadas')
      ? incomingState.historicoParadas
      : currentState.historicoParadas,
    relatorioTurnosNotas: Object.prototype.hasOwnProperty.call(incomingState, 'relatorioTurnosNotas')
      ? incomingState.relatorioTurnosNotas
      : currentState.relatorioTurnosNotas,
    treinamentos: Object.prototype.hasOwnProperty.call(incomingState, 'treinamentos')
      ? incomingState.treinamentos
      : currentState.treinamentos,
    colaboradores: Object.prototype.hasOwnProperty.call(incomingState, 'colaboradores')
      ? incomingState.colaboradores
      : currentState.colaboradores
  };

  const safeState = writeLocalState(mergedState, storageKey);

  if (!supabase) {
    return safeState;
  }

  try {
    const { error } = await supabase
      .from(TABLE_NAME)
      .upsert({
        id: STATE_ID,
        owner_id: user.id,
        equipamentos: safeState.equipamentos,
        historico_paradas: safeState.historicoParadas,
        relatorio_turnos_notas: safeState.relatorioTurnosNotas,
        treinamentos: safeState.treinamentos,
        colaboradores: safeState.colaboradores
      }, { onConflict: 'id' });

    if (error) {
      throw error;
    }

    await writeAuditLog('estado_atualizado', {
      equipamentosAntes: Array.isArray(currentState.equipamentos) ? currentState.equipamentos.length : 0,
      equipamentosDepois: Array.isArray(safeState.equipamentos) ? safeState.equipamentos.length : 0,
      historicoAntes: Array.isArray(currentState.historicoParadas) ? currentState.historicoParadas.length : 0,
      historicoDepois: Array.isArray(safeState.historicoParadas) ? safeState.historicoParadas.length : 0
    });
  } catch (error) {
    console.error('Falha ao salvar no Supabase, mantendo apenas cache local:', error);
  }

  return safeState;
}

export async function saveHistoricoParadas(historicoParadas) {
  const current = await getState();
  current.historicoParadas = Array.isArray(historicoParadas) ? [...historicoParadas] : [];
  const result = await saveState(current);

  await writeAuditLog('historico_atualizado', {
    totalRegistros: Array.isArray(current.historicoParadas) ? current.historicoParadas.length : 0
  });

  return result;
}

export async function getRelatorioTurnosNotas() {
  const current = await getState();
  return cloneRelatorioTurnosNotas(current.relatorioTurnosNotas);
}

export async function saveRelatorioTurnosNotas(notas) {
  const current = await getState();
  current.relatorioTurnosNotas = cloneRelatorioTurnosNotas(notas);
  const result = await saveState(current);

  await writeAuditLog('relatorio_turno_atualizado', {
    turnosComNotas: Object.keys(current.relatorioTurnosNotas || {}).length
  });

  return result;
}

export async function getRelatorioEquipeEletrica() {
  const notas = await getRelatorioTurnosNotas();
  return getRelatorioEquipeEletricaFromNotas(notas);
}

export async function saveRelatorioEquipeEletrica(relatorios) {
  const current = await getState();
  const safeRelatorios = cloneRelatorioEquipeEletrica(relatorios);

  current.relatorioTurnosNotas = mergeRelatorioEquipeEletricaIntoNotas(
    current.relatorioTurnosNotas,
    safeRelatorios
  );

  await saveState(current);

  await writeAuditLog('relatorio_equipe_eletrica_atualizado', {
    totalRegistros: safeRelatorios.length
  });

  return safeRelatorios;
}

export async function getCadastrosBase() {
  const notas = await getRelatorioTurnosNotas();
  return getCadastrosBaseFromNotas(notas);
}

export async function saveCadastrosBase(cadastrosBase) {
  const current = await getState();
  const safeCadastros = cloneCadastrosBase(cadastrosBase);

  current.relatorioTurnosNotas = mergeCadastrosBaseIntoNotas(
    current.relatorioTurnosNotas,
    safeCadastros
  );

  await saveState(current);

  await writeAuditLog('cadastros_base_atualizados', {
    totalColaboradores: safeCadastros.colaboradores.length,
    totalLideresTecnicos: safeCadastros.lideresTecnicos.length,
    totalFerramentas: safeCadastros.ferramentas.length,
    totalVeiculos: safeCadastros.veiculos.length
  });

  return safeCadastros;
}
