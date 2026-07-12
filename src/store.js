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

const supabase = hasRemoteConfig
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

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
  const safeState = writeLocalState(state || {});

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
