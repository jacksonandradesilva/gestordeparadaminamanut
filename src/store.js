import { createClient } from '@supabase/supabase-js';

const STORAGE_KEY = 'mina_status_store_v1';
const TABLE_NAME = 'app_state';
const STATE_ID = 'global';

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
const hasRemoteConfig = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const storageMode = hasRemoteConfig ? 'supabase' : 'local';

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

export function getStorageStatus() {
  return {
    mode: storageMode,
    hasRemoteConfig,
    supabaseUrl: SUPABASE_URL,
    missingEnvVars: [
      ...(SUPABASE_URL ? [] : ['VITE_SUPABASE_URL']),
      ...(SUPABASE_ANON_KEY ? [] : ['VITE_SUPABASE_ANON_KEY'])
    ]
  };
}

function getEmptyState() {
  return {
    equipamentos: [],
    historicoParadas: [],
    relatorioTurnosNotas: {}
  };
}

function cloneRelatorioTurnosNotas(notas) {
  if (!notas || typeof notas !== 'object' || Array.isArray(notas)) {
    return {};
  }

  return { ...notas };
}

function cloneState(state) {
  return {
    equipamentos: Array.isArray(state?.equipamentos) ? [...state.equipamentos] : [],
    historicoParadas: Array.isArray(state?.historicoParadas) ? [...state.historicoParadas] : [],
    relatorioTurnosNotas: cloneRelatorioTurnosNotas(state?.relatorioTurnosNotas)
  };
}

function readLocalState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
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

function writeLocalState(state) {
  const safeState = cloneState(state || {});
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(safeState));
  return safeState;
}

export async function getState() {
  if (!supabase) {
    return readLocalState();
  }

  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('equipamentos, historico_paradas, relatorio_turnos_notas')
      .eq('id', STATE_ID)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      const emptyState = getEmptyState();
      await saveState(emptyState);
      return emptyState;
    }

    const remoteState = cloneState({
      equipamentos: data.equipamentos,
      historicoParadas: data.historico_paradas,
      relatorioTurnosNotas: data.relatorio_turnos_notas
    });

    writeLocalState(remoteState);
    return remoteState;
  } catch (error) {
    console.error('Falha ao ler dados remotos, usando cache local:', error);
    return readLocalState();
  }
}

export async function saveState(state) {
  const incomingState = state && typeof state === 'object' ? state : {};
  const currentState = readLocalState();

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
      : currentState.relatorioTurnosNotas
  };

  const safeState = writeLocalState(mergedState);

  if (!supabase) {
    return safeState;
  }

  try {
    const { error } = await supabase
      .from(TABLE_NAME)
      .upsert({
        id: STATE_ID,
        equipamentos: safeState.equipamentos,
        historico_paradas: safeState.historicoParadas,
        relatorio_turnos_notas: safeState.relatorioTurnosNotas
      });

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Falha ao salvar no Supabase, mantendo apenas cache local:', error);
  }

  return safeState;
}

export async function saveHistoricoParadas(historicoParadas) {
  const current = await getState();
  current.historicoParadas = Array.isArray(historicoParadas) ? [...historicoParadas] : [];
  return saveState(current);
}

export async function getRelatorioTurnosNotas() {
  const current = await getState();
  return cloneRelatorioTurnosNotas(current.relatorioTurnosNotas);
}

export async function saveRelatorioTurnosNotas(notas) {
  const current = await getState();
  current.relatorioTurnosNotas = cloneRelatorioTurnosNotas(notas);
  return saveState(current);
}
