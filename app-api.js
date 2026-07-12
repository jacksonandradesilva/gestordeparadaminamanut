(function () {
  const STORAGE_KEY = 'mina_status_store_v1';

  function cloneState(state) {
    return {
      equipamentos: Array.isArray(state.equipamentos) ? [...state.equipamentos] : [],
      historicoParadas: Array.isArray(state.historicoParadas) ? [...state.historicoParadas] : []
    };
  }

  function getEmptyState() {
    return {
      equipamentos: [],
      historicoParadas: []
    };
  }

  function readState() {
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

  function writeState(nextState) {
    const safeState = cloneState(nextState || {});
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(safeState));
    return safeState;
  }

  window.serverStore = {
    async getState() {
      return readState();
    },

    async saveState(state) {
      return writeState(state);
    },

    async saveHistoricoParadas(historicoParadas) {
      const current = readState();
      current.historicoParadas = Array.isArray(historicoParadas) ? [...historicoParadas] : [];
      return writeState(current);
    }
  };
})();
