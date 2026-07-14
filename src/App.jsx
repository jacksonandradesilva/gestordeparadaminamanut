import { useEffect, useMemo, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { getRelatorioTurnosNotas, getState, saveHistoricoParadas, saveRelatorioTurnosNotas, saveState } from './store';
import { formatDateTime, formatMinutes, getDurationInMinutes } from './utils';

const HISTORICO_OBSERVACOES_KEY = 'mina_historico_observacoes_v1';
const TURNOS = ['A', 'B', 'C', 'D'];

function LinkButton({ to, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `btn-link${isActive ? ' active-link' : ''}`}
      end={to === '/'}
    >
      {children}
    </NavLink>
  );
}

function Header({ title }) {
  return (
    <div className="page-header">
      <h1>{title}</h1>
      <img className="page-header-logo" src="/img/logo-header (1).png" alt="Logo" />
    </div>
  );
}

function PageFooter() {
  return <footer className="page-footer">Criado por: Jackson A. Silva</footer>;
}

function DashboardPage() {
  const [equipamentos, setEquipamentos] = useState([]);
  const [historicoParadas, setHistoricoParadas] = useState([]);
  const [editandoIndex, setEditandoIndex] = useState(null);
  const [formData, setFormData] = useState({
    nome: '',
    status: '',
    turno: '',
    turma: '',
    causa: '',
    horaInicio: '',
    horaFim: ''
  });

  useEffect(() => {
    let active = true;

    async function loadState() {
      const estado = await getState();
      if (!active) {
        return;
      }

      setEquipamentos(Array.isArray(estado.equipamentos) ? estado.equipamentos : []);
      setHistoricoParadas(Array.isArray(estado.historicoParadas) ? estado.historicoParadas : []);
    }

    loadState();

    return () => {
      active = false;
    };
  }, []);

  async function persist(nextEquipamentos, nextHistorico) {
    await saveState({
      equipamentos: nextEquipamentos,
      historicoParadas: nextHistorico
    });
  }

  function registrarHistoricoParada(equipamento, acao, baseHistorico) {
    if (equipamento.status !== 'parado') {
      return baseHistorico;
    }

    return [
      {
        idHistorico: Date.now(),
        equipamentoId: equipamento.id,
        nome: equipamento.nome,
        status: equipamento.status,
        turno: equipamento.turno,
        turma: equipamento.turma,
        causa: equipamento.causa,
        horaInicio: equipamento.horaInicio,
        horaFim: equipamento.horaFim,
        dataHoraCadastro: equipamento.dataHoraCadastro,
        acao,
        dataHoraRegistro: formatDateTime(new Date())
      },
      ...baseHistorico
    ];
  }

  function resetForm() {
    setFormData({
      nome: '',
      status: '',
      turno: '',
      turma: '',
      causa: '',
      horaInicio: '',
      horaFim: ''
    });
    setEditandoIndex(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!formData.nome || !formData.status || !formData.turno || !formData.turma) {
      return;
    }

    const nextId = equipamentos.length > 0 ? Math.max(...equipamentos.map((item) => item.id || 0)) + 1 : 1;
    const dataHoraCadastro = formatDateTime(new Date());
    const equipamentoAtual = editandoIndex !== null ? equipamentos[editandoIndex] : null;

    const equipamentoObj = {
      id: equipamentoAtual?.id ?? nextId,
      nome: formData.nome.trim(),
      status: formData.status,
      turno: formData.turno,
      turma: formData.turma,
      causa: formData.causa.trim(),
      horaInicio: formData.horaInicio,
      horaFim: formData.horaFim,
      dataHoraCadastro: equipamentoAtual?.dataHoraCadastro || dataHoraCadastro
    };

    let nextEquipamentos = [...equipamentos];
    let nextHistorico = [...historicoParadas];

    if (editandoIndex !== null) {
      nextEquipamentos[editandoIndex] = equipamentoObj;
      nextHistorico = registrarHistoricoParada(equipamentoObj, 'Edicao', nextHistorico);
    } else {
      nextEquipamentos = [...nextEquipamentos, equipamentoObj];
      nextHistorico = registrarHistoricoParada(equipamentoObj, 'Cadastro', nextHistorico);
    }

    setEquipamentos(nextEquipamentos);
    setHistoricoParadas(nextHistorico);
    await persist(nextEquipamentos, nextHistorico);
    resetForm();
  }

  function editarEquipamento(index) {
    const equip = equipamentos[index];
    if (!equip) {
      return;
    }

    setEditandoIndex(index);
    setFormData({
      nome: equip.nome || '',
      status: equip.status || '',
      turno: equip.turno || '',
      turma: equip.turma || '',
      causa: equip.causa || '',
      horaInicio: equip.horaInicio || '',
      horaFim: equip.horaFim || ''
    });
  }

  async function excluirEquipamento(index) {
    const nextEquipamentos = equipamentos.filter((_, currentIndex) => currentIndex !== index);
    setEquipamentos(nextEquipamentos);
    await persist(nextEquipamentos, historicoParadas);
  }

  async function limparStatusParado() {
    if (confirm('Tem certeza que deseja remover todos os itens com status "Parado"?')) {
      const nextEquipamentos = equipamentos.filter((equip) => equip.status !== 'parado');
      setEquipamentos(nextEquipamentos);
      await persist(nextEquipamentos, historicoParadas);
    }
  }

  return (
    <main className="page-shell">
      <Header title="Status - Mina Manutencao" />

      <div className="top-actions">
        <LinkButton to="/historico">Ver Gestao de Parada da Manutencao</LinkButton>
        <LinkButton to="/relatorio-turnos">Relatorio por Turno</LinkButton>
        <LinkButton to="/historico-opcoes">Historico por Opcao</LinkButton>
        <LinkButton to="/dashboard-turnos">Dashboard por Turno</LinkButton>
        {equipamentos.some((e) => e.status === 'parado') && (
          <button type="button" className="btn excluir" onClick={limparStatusParado}>Limpar Status Parado</button>
        )}
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-field form-field-wide">
          <label htmlFor="nomeEquip">Painel de Operacao:</label>
          <input
            id="nomeEquip"
            value={formData.nome}
            onChange={(event) => setFormData({ ...formData, nome: event.target.value })}
            required
          />
        </div>

        <div className="form-field">
          <label htmlFor="statusEquip">Status:</label>
          <select
            id="statusEquip"
            value={formData.status}
            onChange={(event) => setFormData({ ...formData, status: event.target.value })}
            required
          >
            <option value="" disabled>Selecione o status</option>
            <option value="parado">Parado</option>
            <option value="liberado">Liberado</option>
            <option value="standby">Standby</option>
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="turnoEquip">Turno:</label>
          <select
            id="turnoEquip"
            value={formData.turno}
            onChange={(event) => setFormData({ ...formData, turno: event.target.value })}
            required
          >
            <option value="" disabled>Selecione o turno</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="D">D</option>
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="turmaEquip">Turma:</label>
          <select
            id="turmaEquip"
            value={formData.turma}
            onChange={(event) => setFormData({ ...formData, turma: event.target.value })}
            required
          >
            <option value="" disabled>Selecione a turma</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="D">D</option>
            <option value="E">E</option>
          </select>
        </div>

        <div className="form-field form-field-wide">
          <label htmlFor="causaParada">Equipamento/Causa:</label>
          <input
            id="causaParada"
            value={formData.causa}
            onChange={(event) => setFormData({ ...formData, causa: event.target.value })}
            placeholder="Equipamento e causa (se aplicavel)"
          />
        </div>

        <div className="form-field">
          <label htmlFor="horaInicio">Horario Inicio:</label>
          <input
            id="horaInicio"
            type="time"
            value={formData.horaInicio}
            onChange={(event) => setFormData({ ...formData, horaInicio: event.target.value })}
          />
        </div>

        <div className="form-field">
          <label htmlFor="horaFim">Horario Fim:</label>
          <input
            id="horaFim"
            type="time"
            value={formData.horaFim}
            onChange={(event) => setFormData({ ...formData, horaFim: event.target.value })}
          />
        </div>

        <div className="form-actions">
          <button type="submit">{editandoIndex !== null ? 'Salvar edicao' : 'Cadastrar'}</button>
          <button type="button" className="btn excluir" onClick={resetForm}>Limpar</button>
        </div>
      </form>

      <h2>Status Mina</h2>
      <table>
        <thead>
          <tr>
            <th>Painel de Lavra</th>
            <th>Status</th>
            <th>Turno</th>
            <th>Turma</th>
            <th>Causa da Parada</th>
            <th>Horario Inicio</th>
            <th>Horario Fim</th>
            <th>Data e Hora Cadastro</th>
            <th>Acoes</th>
          </tr>
        </thead>
        <tbody>
          {equipamentos.map((equip, idx) => (
            <tr key={equip.id ?? idx}>
              <td data-label="Painel de Lavra">{equip.nome}</td>
              <td data-label="Status" className={`status-${equip.status}`}>{equip.status}</td>
              <td data-label="Turno">{equip.turno || '-'}</td>
              <td data-label="Turma">{equip.turma || '-'}</td>
              <td data-label="Causa da Parada">{equip.causa || '-'}</td>
              <td data-label="Horario Inicio">{equip.horaInicio || '-'}</td>
              <td data-label="Horario Fim">{equip.horaFim || '-'}</td>
              <td data-label="Data e Hora Cadastro">{equip.dataHoraCadastro || '-'}</td>
              <td data-label="Acoes">
                <div className="acoes-inline">
                  <button className="btn editar" type="button" onClick={() => editarEquipamento(idx)}>Editar</button>
                  <button className="btn excluir" type="button" onClick={() => excluirEquipamento(idx)}>Excluir</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <PageFooter />
    </main>
  );
}

function HistoricoPage() {
  const [historicoParadas, setHistoricoParadas] = useState([]);
  const [observacoes, setObservacoes] = useState('');
  const [editId, setEditId] = useState(null);
  const [editData, setEditData] = useState({
    nome: '',
    status: 'parado',
    turno: 'A',
    turma: 'A',
    causa: '',
    horaInicio: '',
    horaFim: '',
    acao: 'corretiva'
  });

  const totalHorasParadas = useMemo(() => {
    const accumulated = historicoParadas.reduce((total, item) => total + getDurationInMinutes(item), 0);
    return formatMinutes(accumulated);
  }, [historicoParadas]);

  useEffect(() => {
    let active = true;

    async function loadHistorico() {
      const state = await getState();
      if (!active) {
        return;
      }

      setHistoricoParadas(Array.isArray(state.historicoParadas) ? state.historicoParadas : []);
    }

    loadHistorico();

    try {
      setObservacoes(window.localStorage.getItem(HISTORICO_OBSERVACOES_KEY) || '');
    } catch {
      setObservacoes('');
    }

    return () => {
      active = false;
    };
  }, []);

  function limparFormularioEdicao() {
    setEditId(null);
    setEditData({
      nome: '',
      status: 'parado',
      turno: 'A',
      turma: 'A',
      causa: '',
      horaInicio: '',
      horaFim: '',
      acao: 'corretiva'
    });
  }

  function abrirEdicao(item) {
    setEditId(item.idHistorico);
    setEditData({
      nome: item.nome || '',
      status: item.status || 'parado',
      turno: item.turno || 'A',
      turma: item.turma || 'A',
      causa: item.causa || '',
      horaInicio: item.horaInicio || '',
      horaFim: item.horaFim || '',
      acao: ['corretiva', 'preventiva', 'preditiva', 'programada'].includes(item.acao) ? item.acao : 'corretiva'
    });
  }

  function salvarObservacoes() {
    window.localStorage.setItem(HISTORICO_OBSERVACOES_KEY, observacoes);
    window.alert('Observacoes salvas com sucesso.');
  }

  async function limparHistorico() {
    setHistoricoParadas([]);
    await saveHistoricoParadas([]);
    limparFormularioEdicao();
  }

  async function excluirItem(id) {
    const next = historicoParadas.filter((item) => item.idHistorico !== id);
    setHistoricoParadas(next);
    await saveHistoricoParadas(next);
  }

  async function salvarEdicao(event) {
    event.preventDefault();

    if (editId === null) {
      return;
    }

    const next = historicoParadas.map((item) => {
      if (item.idHistorico !== editId) {
        return item;
      }

      return {
        ...item,
        ...editData,
        nome: editData.nome.trim(),
        causa: editData.causa.trim()
      };
    });

    setHistoricoParadas(next);
    await saveHistoricoParadas(next);
    limparFormularioEdicao();
  }

  return (
    <main className="page-shell">
      <Header title="Gestao de Parada da Manutencao" />

      <div className="page-actions">
        <LinkButton to="/">Voltar ao painel</LinkButton>
      </div>

      {editId !== null && (
        <form onSubmit={salvarEdicao}>
          <div className="form-field">
            <label>Painel</label>
            <input
              value={editData.nome}
              onChange={(event) => setEditData({ ...editData, nome: event.target.value })}
              required
            />
          </div>
          <div className="form-field">
            <label>Status</label>
            <select value={editData.status} onChange={(event) => setEditData({ ...editData, status: event.target.value })} required>
              <option value="parado">Parado</option>
              <option value="liberado">Liberado</option>
              <option value="standby">Standby</option>
            </select>
          </div>
          <div className="form-field">
            <label>Turno</label>
            <select value={editData.turno} onChange={(event) => setEditData({ ...editData, turno: event.target.value })} required>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
              <option value="D">D</option>
            </select>
          </div>
          <div className="form-field">
            <label>Turma</label>
            <select value={editData.turma} onChange={(event) => setEditData({ ...editData, turma: event.target.value })} required>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
              <option value="D">D</option>
              <option value="E">E</option>
            </select>
          </div>
          <div className="form-field form-field-wide">
            <label>Equipe de Manutencao</label>
            <input
              value={editData.causa}
              onChange={(event) => setEditData({ ...editData, causa: event.target.value })}
            />
          </div>
          <div className="form-field">
            <label>Inicio</label>
            <input
              type="time"
              value={editData.horaInicio}
              onChange={(event) => setEditData({ ...editData, horaInicio: event.target.value })}
            />
          </div>
          <div className="form-field">
            <label>Fim</label>
            <input
              type="time"
              value={editData.horaFim}
              onChange={(event) => setEditData({ ...editData, horaFim: event.target.value })}
            />
          </div>
          <div className="form-field">
            <label>Tipo de Manutencao</label>
            <select value={editData.acao} onChange={(event) => setEditData({ ...editData, acao: event.target.value })} required>
              <option value="corretiva">Corretiva</option>
              <option value="preventiva">Preventiva</option>
              <option value="preditiva">Preditiva</option>
              <option value="programada">Programada</option>
            </select>
          </div>
          <div className="form-actions">
            <button type="submit">Salvar edicao</button>
            <button type="button" className="btn secundario" onClick={limparFormularioEdicao}>Cancelar</button>
          </div>
        </form>
      )}

      <section className="summary-cards">
        <article className="card observacoes-card">
          <span>Observacoes</span>
          <textarea
            rows="4"
            placeholder="Digite observacoes da gestao de parada da manutencao..."
            value={observacoes}
            onChange={(event) => setObservacoes(event.target.value)}
          />
          <button type="button" onClick={salvarObservacoes}>Salvar observacoes</button>
        </article>
        <article className="card">
          <span>Tempo total de parada</span>
          <strong>{totalHorasParadas}</strong>
        </article>
      </section>

      <table>
        <thead>
          <tr>
            <th>Painel</th>
            <th>Status</th>
            <th>Turno</th>
            <th>Turma</th>
            <th>Equipe de Manutencao</th>
            <th>Inicio</th>
            <th>Fim</th>
            <th>Tipo de Manutencao</th>
            <th>Registro</th>
            <th>Acoes</th>
          </tr>
        </thead>
        <tbody>
          {historicoParadas.map((item) => (
            <tr key={item.idHistorico}>
              <td data-label="Painel">{item.nome || '-'}</td>
              <td data-label="Status" className={`${item.status ? `status-${item.status}` : ''} ${item.status === 'parado' ? 'status-highlight' : ''}`.trim()}>
                {item.status || '-'}
              </td>
              <td data-label="Turno">{item.turno || '-'}</td>
              <td data-label="Turma">{item.turma || '-'}</td>
              <td data-label="Equipe de Manutencao">{item.causa || '-'}</td>
              <td data-label="Inicio">{item.horaInicio || '-'}</td>
              <td data-label="Fim">{item.horaFim || '-'}</td>
              <td data-label="Tipo de Manutencao">{item.acao || '-'}</td>
              <td data-label="Registro">{item.dataHoraRegistro || '-'}</td>
              <td data-label="Acoes">
                <div className="acoes-inline">
                  <button className="btn editar" type="button" onClick={() => abrirEdicao(item)}>Editar</button>
                  <button className="btn excluir" type="button" onClick={() => excluirItem(item.idHistorico)}>Excluir</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {historicoParadas.length === 0 && <div className="empty-state">Nenhuma parada registrada.</div>}

      <PageFooter />
    </main>
  );
}

function HistoricoOpcoesPage() {
  const [historicoCompleto, setHistoricoCompleto] = useState([]);
  const [filtroNome, setFiltroNome] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroTurno, setFiltroTurno] = useState('');
  const [filtroTurma, setFiltroTurma] = useState('');

  useEffect(() => {
    let active = true;

    async function loadHistoricoCompleto() {
      const state = await getState();
      if (!active) {
        return;
      }

      setHistoricoCompleto(Array.isArray(state.historicoParadas) ? state.historicoParadas : []);
    }

    loadHistoricoCompleto();

    return () => {
      active = false;
    };
  }, []);

  const nomeFiltro = filtroNome.trim().toLowerCase();

  const filtradosBase = useMemo(() => {
    return historicoCompleto.filter((item) => {
      const matchStatus = !filtroStatus || item.status === filtroStatus;
      const matchTurno = !filtroTurno || item.turno === filtroTurno;
      const matchTurma = !filtroTurma || item.turma === filtroTurma;
      return matchStatus && matchTurno && matchTurma;
    });
  }, [filtroStatus, filtroTurno, filtroTurma, historicoCompleto]);

  const filtrados = useMemo(() => {
    if (!nomeFiltro) {
      return filtradosBase;
    }

    return filtradosBase.filter((item) => (item.nome || '').toLowerCase().includes(nomeFiltro));
  }, [nomeFiltro, filtradosBase]);

  const totalHorarioFiltrado = useMemo(() => {
    const totalMin = filtradosBase.reduce((total, item) => total + getDurationInMinutes(item), 0);
    return formatMinutes(totalMin);
  }, [filtradosBase]);

  const totalHorarioPainel = useMemo(() => {
    if (!nomeFiltro) {
      return '00:00';
    }

    const totalMin = filtrados.reduce((total, item) => total + getDurationInMinutes(item), 0);
    return formatMinutes(totalMin);
  }, [nomeFiltro, filtrados]);

  return (
    <main className="page-shell">
      <Header title="Historico por Opcao" />

      <div className="page-actions">
        <LinkButton to="/">Voltar ao painel</LinkButton>
      </div>

      <section className="filter-bar">
        <input
          type="text"
          placeholder="Filtrar por painel"
          value={filtroNome}
          onChange={(event) => setFiltroNome(event.target.value)}
        />
        <select value={filtroStatus} onChange={(event) => setFiltroStatus(event.target.value)}>
          <option value="">Todos os status</option>
          <option value="parado">Parado</option>
          <option value="liberado">Liberado</option>
          <option value="standby">Standby</option>
        </select>
        <select value={filtroTurno} onChange={(event) => setFiltroTurno(event.target.value)}>
          <option value="">Todos os turnos</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
          <option value="D">D</option>
        </select>
        <select value={filtroTurma} onChange={(event) => setFiltroTurma(event.target.value)}>
          <option value="">Todas as turmas</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
          <option value="D">D</option>
          <option value="E">E</option>
        </select>
      </section>

      <section className="summary-cards">
        <article className="card">
          <span>Horario total das paradas</span>
          <strong>{totalHorarioFiltrado}</strong>
        </article>
        <article className="card">
          <span>Total do painel pesquisado</span>
          <strong>{totalHorarioPainel}</strong>
        </article>
      </section>

      <table>
        <thead>
          <tr>
            <th>Painel</th>
            <th>Status</th>
            <th>Turno</th>
            <th>Turma</th>
            <th>Equipe Mecanica</th>
            <th>Inicio</th>
            <th>Fim</th>
            <th>Registro</th>
          </tr>
        </thead>
        <tbody>
          {filtrados.map((item) => (
            <tr key={item.idHistorico}>
              <td data-label="Painel">{item.nome || '-'}</td>
              <td data-label="Status">{item.status || '-'}</td>
              <td data-label="Turno">{item.turno || '-'}</td>
              <td data-label="Turma">{item.turma || '-'}</td>
              <td data-label="Equipe Mecanica">{item.causa || '-'}</td>
              <td data-label="Inicio">{item.horaInicio || '-'}</td>
              <td data-label="Fim">{item.horaFim || '-'}</td>
              <td data-label="Registro">{item.dataHoraRegistro || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {filtrados.length === 0 && <div className="empty-state">Nenhum item encontrado para o filtro atual.</div>}

      <PageFooter />
    </main>
  );
}

function DashboardTurnosPage() {
  const [historicoParadas, setHistoricoParadas] = useState([]);
  const [filtroTurno, setFiltroTurno] = useState('');

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      const state = await getState();
      if (!active) {
        return;
      }

      setHistoricoParadas(Array.isArray(state.historicoParadas) ? state.historicoParadas : []);
    }

    loadDashboard();

    return () => {
      active = false;
    };
  }, []);

  const turnos = TURNOS;

  const resumoTurnos = useMemo(() => {
    const base = turnos.reduce((acc, turno) => {
      acc[turno] = {
        quantidade: 0,
        minutos: 0
      };
      return acc;
    }, {});

    historicoParadas.forEach((item) => {
      if (!base[item.turno]) {
        return;
      }

      base[item.turno].quantidade += 1;
      base[item.turno].minutos += getDurationInMinutes(item);
    });

    return base;
  }, [historicoParadas]);

  const totalMinutos = useMemo(() => {
    return historicoParadas.reduce((total, item) => total + getDurationInMinutes(item), 0);
  }, [historicoParadas]);

  const itensFiltrados = useMemo(() => {
    if (!filtroTurno) {
      return historicoParadas;
    }

    return historicoParadas.filter((item) => item.turno === filtroTurno);
  }, [filtroTurno, historicoParadas]);

  return (
    <main className="page-shell">
      <Header title="Dashboard de Paradas por Turno" />

      <div className="page-actions">
        <LinkButton to="/">Voltar ao painel</LinkButton>
      </div>

      <section className="summary-cards">
        <article className="card">
          <span>Horario total de parada</span>
          <strong>{formatMinutes(totalMinutos)}</strong>
        </article>
        <article className="card">
          <span>Total de registros</span>
          <strong>{historicoParadas.length}</strong>
        </article>
      </section>

      <h2>Resumo por turno</h2>
      <table>
        <thead>
          <tr>
            <th>Turno</th>
            <th>Total de paradas</th>
            <th>Horario acumulado</th>
          </tr>
        </thead>
        <tbody>
          {turnos.map((turno) => (
            <tr key={turno}>
              <td data-label="Turno">{turno}</td>
              <td data-label="Total de paradas">{resumoTurnos[turno].quantidade}</td>
              <td data-label="Horario acumulado">{formatMinutes(resumoTurnos[turno].minutos)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Detalhes das paradas</h2>
      <section className="filter-bar dashboard-filter-bar">
        <select value={filtroTurno} onChange={(event) => setFiltroTurno(event.target.value)}>
          <option value="">Todos os turnos</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
          <option value="D">D</option>
        </select>
      </section>

      <table>
        <thead>
          <tr>
            <th>Painel</th>
            <th>Status</th>
            <th>Turno</th>
            <th>Turma</th>
            <th>Inicio</th>
            <th>Fim</th>
            <th>Duracao</th>
            <th>Registro</th>
          </tr>
        </thead>
        <tbody>
          {itensFiltrados.map((item) => (
            <tr key={item.idHistorico}>
              <td data-label="Painel">{item.nome || '-'}</td>
              <td data-label="Status">{item.status || '-'}</td>
              <td data-label="Turno">{item.turno || '-'}</td>
              <td data-label="Turma">{item.turma || '-'}</td>
              <td data-label="Inicio">{item.horaInicio || '-'}</td>
              <td data-label="Fim">{item.horaFim || '-'}</td>
              <td data-label="Duracao">{formatMinutes(getDurationInMinutes(item))}</td>
              <td data-label="Registro">{item.dataHoraRegistro || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {itensFiltrados.length === 0 && <div className="empty-state">Nenhuma parada registrada para o filtro atual.</div>}

      <PageFooter />
    </main>
  );
}

function RelatorioPorTurnoPage() {
  const [historicoParadas, setHistoricoParadas] = useState([]);
  const [turnoAtivo, setTurnoAtivo] = useState('A');
  const [notasTurno, setNotasTurno] = useState({});
  const [turmaOpcional, setTurmaOpcional] = useState('A');
  const [dataHorarioRelatorio, setDataHorarioRelatorio] = useState('');
  const [liderTecnico, setLiderTecnico] = useState('');
  const [supervisor, setSupervisor] = useState('');
  const [equipeManutencao, setEquipeManutencao] = useState('');
  const [breveRelato, setBreveRelato] = useState('');

  useEffect(() => {
    let active = true;

    async function loadRelatorioTurnos() {
      const [state, notas] = await Promise.all([
        getState(),
        getRelatorioTurnosNotas()
      ]);

      if (!active) {
        return;
      }

      setHistoricoParadas(Array.isArray(state.historicoParadas) ? state.historicoParadas : []);
      setNotasTurno(notas);
    }

    loadRelatorioTurnos();

    return () => {
      active = false;
    };
  }, []);

  function carregarNotasDoTurno(turno, notas) {
    const registro = notas[turno] || {};
    setTurmaOpcional(registro.turmaOpcional || 'A');
    setDataHorarioRelatorio(registro.dataHorarioRelatorio || '');
    setLiderTecnico(registro.liderTecnico || '');
    setSupervisor(registro.supervisor || '');
    setEquipeManutencao(registro.equipeManutencao || '');
    setBreveRelato(registro.breveRelato || '');
  }

  useEffect(() => {
    carregarNotasDoTurno(turnoAtivo, notasTurno);
  }, [turnoAtivo, notasTurno]);

  async function salvarNotasTurno(event) {
    event.preventDefault();

    const nextNotas = {
      ...notasTurno,
      [turnoAtivo]: {
        turmaOpcional,
        dataHorarioRelatorio,
        liderTecnico: liderTecnico.trim(),
        supervisor: supervisor.trim(),
        equipeManutencao: equipeManutencao.trim(),
        breveRelato: breveRelato.trim()
      }
    };

    setNotasTurno(nextNotas);
    await saveRelatorioTurnosNotas(nextNotas);
    window.alert(`Informacoes do turno ${turnoAtivo} salvas com sucesso.`);
  }

  async function limparNotasTurno() {
    const nextNotas = { ...notasTurno };
    delete nextNotas[turnoAtivo];

    setNotasTurno(nextNotas);
    await saveRelatorioTurnosNotas(nextNotas);
    setTurmaOpcional('A');
    setDataHorarioRelatorio('');
    setLiderTecnico('');
    setSupervisor('');
    setEquipeManutencao('');
    setBreveRelato('');
    window.alert(`Informacoes do turno ${turnoAtivo} removidas.`);
  }

  const turnos = TURNOS;

  const resumoPorTurno = useMemo(() => {
    const base = {
      A: { quantidade: 0, minutos: 0 },
      B: { quantidade: 0, minutos: 0 },
      C: { quantidade: 0, minutos: 0 },
      D: { quantidade: 0, minutos: 0 }
    };

    historicoParadas.forEach((item) => {
      if (!base[item.turno]) {
        return;
      }

      base[item.turno].quantidade += 1;
      base[item.turno].minutos += getDurationInMinutes(item);
    });

    return base;
  }, [historicoParadas]);

  const registrosTurnoAtivo = useMemo(() => {
    return historicoParadas.filter((item) => item.turno === turnoAtivo);
  }, [historicoParadas, turnoAtivo]);

  return (
    <main className="page-shell">
      <Header title="Relatorio de Parada por Turno" />

      <div className="page-actions">
        <LinkButton to="/">Voltar ao painel</LinkButton>
      </div>

      <section className="turno-tabs" aria-label="Selecao de turno">
        {turnos.map((turno) => (
          <button
            key={turno}
            type="button"
            className={`btn turno-tab-btn${turnoAtivo === turno ? ' active' : ''}`}
            onClick={() => setTurnoAtivo(turno)}
          >
            Turno {turno}
          </button>
        ))}
      </section>

      <form onSubmit={salvarNotasTurno}>
        <div className="form-field">
          <label>Turma</label>
          <select value={turmaOpcional} onChange={(event) => setTurmaOpcional(event.target.value)}>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="D">D</option>
            <option value="E">E</option>
          </select>
        </div>
        <div className="form-field">
          <label>Data e Horario do Relatorio</label>
          <input
            type="datetime-local"
            value={dataHorarioRelatorio}
            onChange={(event) => setDataHorarioRelatorio(event.target.value)}
          />
        </div>
        <div className="form-field form-field-wide">
          <label>Lider Tecnico</label>
          <input
            value={liderTecnico}
            onChange={(event) => setLiderTecnico(event.target.value)}
            placeholder="Nome do lider tecnico do turno"
          />
        </div>
        <div className="form-field form-field-wide">
          <label>Supervisor</label>
          <input
            value={supervisor}
            onChange={(event) => setSupervisor(event.target.value)}
            placeholder="Digite nome do Supervisor de Manutencao"
          />
        </div>
        <div className="form-field form-field-wide">
          <label>Equipe de Manutencao</label>
          <input
            value={equipeManutencao}
            onChange={(event) => setEquipeManutencao(event.target.value)}
            placeholder="Equipe de manutencao"
          />
        </div>
        <div className="form-field form-field-wide">
          <label>Descricao do Turno</label>
          <textarea
            rows="3"
            value={breveRelato}
            onChange={(event) => setBreveRelato(event.target.value)}
            placeholder="Escreva a descricao do turno"
          />
        </div>
        <div className="form-actions">
          <button type="submit">Salvar informacoes do turno {turnoAtivo}</button>
          <button type="button" className="btn secundario" onClick={limparNotasTurno}>Limpar informacoes do turno {turnoAtivo}</button>
        </div>
      </form>

      <section className="summary-cards">
        <article className="card">
          <span>Tempo total de parada - Turno {turnoAtivo}</span>
          <strong>{formatMinutes(resumoPorTurno[turnoAtivo].minutos)}</strong>
        </article>
        <article className="card">
          <span>Total de paradas - Turno {turnoAtivo}</span>
          <strong>{resumoPorTurno[turnoAtivo].quantidade}</strong>
        </article>
      </section>

      <table>
        <thead>
          <tr>
            <th>Painel</th>
            <th>Status</th>
            <th>Turno</th>
            <th>Turma</th>
            <th>Equipe de Manutencao</th>
            <th>Inicio</th>
            <th>Fim</th>
            <th>Duracao</th>
            <th>Cadastro</th>
          </tr>
        </thead>
        <tbody>
          {registrosTurnoAtivo.map((item) => (
            <tr key={item.idHistorico}>
              <td data-label="Painel">{item.nome || '-'}</td>
              <td data-label="Status">{item.status || '-'}</td>
              <td data-label="Turno">{item.turno || '-'}</td>
              <td data-label="Turma">{item.turma || '-'}</td>
              <td data-label="Equipe de Manutencao">{item.causa || '-'}</td>
              <td data-label="Inicio">{item.horaInicio || '-'}</td>
              <td data-label="Fim">{item.horaFim || '-'}</td>
              <td data-label="Duracao">{formatMinutes(getDurationInMinutes(item))}</td>
              <td data-label="Cadastro">{item.dataHoraCadastro || item.dataHoraRegistro || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {registrosTurnoAtivo.length === 0 && (
        <div className="empty-state">Nenhuma parada registrada para o turno {turnoAtivo}.</div>
      )}

      <PageFooter />
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/historico" element={<HistoricoPage />} />
      <Route path="/relatorio-turnos" element={<RelatorioPorTurnoPage />} />
      <Route path="/historico-opcoes" element={<HistoricoOpcoesPage />} />
      <Route path="/dashboard-turnos" element={<DashboardTurnosPage />} />
    </Routes>
  );
}
