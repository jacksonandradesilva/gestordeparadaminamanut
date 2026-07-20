// Componente principal da aplicação
import { useEffect, useMemo, useRef, useState } from 'react';
// Importações do React Router
import { NavLink, Route, Routes } from 'react-router-dom';
// Importações de componentes e funções auxiliares
import {
  clearAccessAuditLogs,
  clearAllAuditLogs,
  deleteUserAccess,
  getCadastrosBase,
  getRelatorioEquipeEletrica,
  PAGE_ACCESS_KEYS,
  fetchAuditLogs,
  fetchManagedUserAccesses,
  getCurrentSession,
  getIsCurrentUserAdmin,
  getCurrentUserAccessProfile,
  getRelatorioTurnosNotas,
  getState,
  getStorageStatus,
  saveCadastrosBase,
  saveRelatorioEquipeEletrica,
  saveHistoricoParadas,
  saveRelatorioTurnosNotas,
  saveState,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  subscribeAuthChanges,
  updateUserAccessPermissions,
  updateUserAccessStatus,
  writeAuditLog
} from './store';
// Importações de componentes de página
import { formatDateTime, formatMinutes, getDurationInMinutes } from './utils';
// Importações de estilos
const HISTORICO_OBSERVACOES_KEY = 'mina_historico_observacoes_v1';
const TURNOS = ['A', 'B', 'C', 'D'];
const PAGE_ACCESS_OPTIONS = [
  { key: 'dashboard', label: 'Painel principal', path: '/' },
  { key: 'historico', label: 'Gestao de parada', path: '/historico' },
  { key: 'relatorio-turnos', label: 'Relatorio por turno', path: '/relatorio-turnos' },
  { key: 'relatorio-equipe-eletrica', label: 'Relatorio equipe eletrica', path: '/relatorio-equipe-eletrica' },
  { key: 'historico-opcoes', label: 'Historico por opcao', path: '/historico-opcoes' },
  { key: 'dashboard-turnos', label: 'Dashboard por turno', path: '/dashboard-turnos' },
  { key: 'agente-ia', label: 'Agente IA', path: '/agente-ia' }
];

function normalizeAllowedPages(pages) {
  if (!Array.isArray(pages)) {
    return [];
  }

  const validKeys = new Set(PAGE_ACCESS_KEYS);

  return [...new Set(
    pages
      .map((item) => String(item || '').trim())
      .filter((item) => validKeys.has(item))
  )];
}

function getPageLabelByKey(pageKey) {
  const found = PAGE_ACCESS_OPTIONS.find((item) => item.key === pageKey);
  return found?.label || pageKey;
}
// Função para normalizar texto, removendo acentos e convertendo para minúsculas
function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function toParadaBase(historicoParadas) {
  const list = Array.isArray(historicoParadas) ? historicoParadas : [];
  const onlyParado = list.filter((item) => normalizeText(item?.status) === 'parado');
  return onlyParado.length > 0 ? onlyParado : list;
}

function groupParadasBy(list, fieldName) {
  const grouped = new Map();

  list.forEach((item) => {
    const key = String(item?.[fieldName] || 'Nao informado').trim() || 'Nao informado';
    const prev = grouped.get(key) || { label: key, quantidade: 0, minutos: 0 };

    grouped.set(key, {
      label: key,
      quantidade: prev.quantidade + 1,
      minutos: prev.minutos + getDurationInMinutes(item)
    });
  });

  return [...grouped.values()].sort((a, b) => {
    if (b.quantidade !== a.quantidade) {
      return b.quantidade - a.quantidade;
    }

    return b.minutos - a.minutos;
  });
}

function buildAgentReply(question, historicoParadas) {
  const pergunta = normalizeText(question);
  const baseParadas = toParadaBase(historicoParadas);

  if (!pergunta) {
    return {
      title: 'Escreva uma pergunta',
      content: 'Exemplo: qual painel teve mais parada?'
    };
  }

  if (baseParadas.length === 0) {
    return {
      title: 'Sem dados para analisar',
      content: 'Ainda nao existem registros de parada no historico.'
    };
  }

  const painelRank = groupParadasBy(baseParadas, 'nome');
  const turnoRank = groupParadasBy(baseParadas, 'turno');
  const turmaRank = groupParadasBy(baseParadas, 'turma');
  const totalMinutos = baseParadas.reduce((acc, item) => acc + getDurationInMinutes(item), 0);

  const wantsPainel = pergunta.includes('painel');
  const wantsTurno = pergunta.includes('turno');
  const wantsTurma = pergunta.includes('turma');
  const wantsMost = pergunta.includes('mais') || pergunta.includes('maior');
  const wantsTotalTime = pergunta.includes('tempo total') || pergunta.includes('horario total') || pergunta.includes('duracao total');
  const wantsCount = pergunta.includes('quantas') || pergunta.includes('quantidade') || pergunta.includes('total de paradas') || pergunta.includes('total de parada');

  if (wantsPainel && wantsMost) {
    const top = painelRank[0];
    return {
      title: 'Painel com mais paradas',
      content: `O painel ${top.label} teve mais paradas: ${top.quantidade} registros, somando ${formatMinutes(top.minutos)}.`
    };
  }

  if (wantsTurno && wantsMost) {
    const top = turnoRank[0];
    return {
      title: 'Turno com mais paradas',
      content: `O turno ${top.label} lidera com ${top.quantidade} registros e ${formatMinutes(top.minutos)} de parada acumulada.`
    };
  }

  if (wantsTurma && wantsMost) {
    const top = turmaRank[0];
    return {
      title: 'Turma com mais paradas',
      content: `A turma ${top.label} teve ${top.quantidade} paradas, totalizando ${formatMinutes(top.minutos)}.`
    };
  }

  if (wantsTotalTime) {
    return {
      title: 'Tempo total de parada',
      content: `O tempo total acumulado nas paradas e ${formatMinutes(totalMinutos)}.`
    };
  }

  if (wantsCount) {
    return {
      title: 'Quantidade de paradas',
      content: `Foram registradas ${baseParadas.length} paradas no historico analisado.`
    };
  }

  return {
    title: 'Pergunta nao reconhecida',
    content: 'Tente perguntar sobre painel, turno, turma, quantidade total ou tempo total de parada.'
  };
}

function SessionBar({ email, isAdmin, onSignOut }) {
  return (
    <div className="session-bar">
      <span>Sessao ativa: {email || 'Usuario autenticado'}</span>
      <div className="session-actions">
        {isAdmin && <LinkButton to="/admin-acessos">Liberacao de Acessos</LinkButton>}
        {isAdmin && <LinkButton to="/admin-auditoria">Auditoria Admin</LinkButton>}
        <button type="button" className="btn secundario" onClick={onSignOut}>Sair</button>
      </div>
    </div>
  );
}

function formatAccessStatus(status) {
  if (status === 'approved') {
    return 'Liberado';
  }

  return 'Pendente';
}

function AdminAccessPage({ isAdmin }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [draftAllowedPages, setDraftAllowedPages] = useState({});

  function hydrateDraftPermissions(items) {
    const nextDraft = {};

    (Array.isArray(items) ? items : []).forEach((item) => {
      nextDraft[item.user_id] = normalizeAllowedPages(item.allowed_pages);
    });

    setDraftAllowedPages(nextDraft);
  }

  async function loadRecords() {
    setLoading(true);
    setError('');

    try {
      const result = await fetchManagedUserAccesses();
      setRecords(result);
      hydrateDraftPermissions(result);
    } catch (loadError) {
      setError(loadError?.message || 'Nao foi possivel carregar os acessos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      setRecords([]);
      setError('Acesso restrito ao administrador.');
      return;
    }

    loadRecords();
  }, [isAdmin]);

  async function handleStatusChange(targetUserId, nextStatus) {
    setLoading(true);
    setError('');
    setInfoMessage('');

    try {
      await updateUserAccessStatus(targetUserId, nextStatus, draftAllowedPages[targetUserId] || []);
      await loadRecords();
      setInfoMessage(nextStatus === 'approved' ? 'Usuario liberado com sucesso.' : 'Usuario retornou para pendente.');
    } catch (updateError) {
      setError(updateError?.message || 'Nao foi possivel atualizar o acesso.');
      setLoading(false);
    }
  }

  function togglePagePermission(targetUserId, pageKey, enabled) {
    setDraftAllowedPages((current) => {
      const previous = Array.isArray(current[targetUserId]) ? current[targetUserId] : [];
      const nextSet = new Set(previous);

      if (enabled) {
        nextSet.add(pageKey);
      } else {
        nextSet.delete(pageKey);
      }

      return {
        ...current,
        [targetUserId]: [...nextSet]
      };
    });
  }

  async function handleSavePermissions(targetUserId) {
    setLoading(true);
    setError('');
    setInfoMessage('');

    try {
      const pages = draftAllowedPages[targetUserId] || [];
      await updateUserAccessPermissions(targetUserId, pages);
      await loadRecords();
      setInfoMessage('Paginas liberadas atualizadas com sucesso.');
    } catch (updateError) {
      setError(updateError?.message || 'Nao foi possivel salvar as paginas liberadas.');
      setLoading(false);
    }
  }

  async function handleDeleteAccess(targetUserId, email) {
    const confirmacao = window.confirm(`Deseja excluir o cadastro de acesso de ${email || targetUserId}?`);

    if (!confirmacao) {
      return;
    }

    setLoading(true);
    setError('');
    setInfoMessage('');

    try {
      const removed = await deleteUserAccess(targetUserId);

      if (removed) {
        await loadRecords();
        setInfoMessage('Cadastro de acesso excluido com sucesso.');
      } else {
        setInfoMessage('Nenhum cadastro foi removido.');
        setLoading(false);
      }
    } catch (deleteError) {
      setError(deleteError?.message || 'Nao foi possivel excluir o cadastro de acesso.');
      setLoading(false);
    }
  }

  const pendingRecords = records.filter((item) => item.status !== 'approved');
  const approvedRecords = records.filter((item) => item.status === 'approved');

  return (
    <main className="page-shell">
      <Header title="Liberacao de Acessos" />

      <div className="page-actions">
        <LinkButton to="/">Voltar ao painel</LinkButton>
        <LinkButton to="/admin-auditoria">Abrir auditoria</LinkButton>
        <button type="button" className="btn secundario" onClick={loadRecords} disabled={loading || !isAdmin}>
          Atualizar
        </button>
      </div>

      {loading && <div className="alert alert-info">Carregando usuarios cadastrados...</div>}
      {error && <div className="alert alert-danger">{error}</div>}
      {infoMessage && <div className="alert alert-success">{infoMessage}</div>}

      {!loading && !error && (
        <>
          <section className="summary-cards">
            <article className="card">
              <span>Pendentes</span>
              <strong>{pendingRecords.length}</strong>
            </article>
            <article className="card">
              <span>Liberados</span>
              <strong>{approvedRecords.length}</strong>
            </article>
          </section>

          <table>
            <thead>
              <tr>
                <th>E-mail</th>
                <th>Status</th>
                <th>Cadastro</th>
                <th>Liberado em</th>
                <th>Paginas liberadas</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {records.map((item) => {
                const isApproved = item.status === 'approved';
                const selectedPages = normalizeAllowedPages(draftAllowedPages[item.user_id] || []);

                return (
                  <tr key={item.user_id}>
                    <td data-label="E-mail">{item.email || item.user_id}</td>
                    <td data-label="Status">{formatAccessStatus(item.status)}</td>
                    <td data-label="Cadastro">{item.created_at ? formatDateTime(new Date(item.created_at)) : '-'}</td>
                    <td data-label="Liberado em">{item.approved_at ? formatDateTime(new Date(item.approved_at)) : '-'}</td>
                    <td data-label="Paginas liberadas">
                      <div className="access-pages-grid">
                        {PAGE_ACCESS_OPTIONS.map((page) => {
                          const checked = selectedPages.includes(page.key);

                          return (
                            <label key={`${item.user_id}-${page.key}`} className="checkbox-inline">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(event) => togglePagePermission(item.user_id, page.key, event.target.checked)}
                                disabled={loading || !isAdmin}
                              />
                              <span>{page.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </td>
                    <td data-label="Acoes">
                      <div className="table-actions">
                        <button
                          type="button"
                          className="btn secundario"
                          onClick={() => handleStatusChange(item.user_id, 'approved')}
                          disabled={loading || isApproved}
                        >
                          Liberar
                        </button>
                        <button
                          type="button"
                          className="btn excluir"
                          onClick={() => handleStatusChange(item.user_id, 'pending')}
                          disabled={loading || !isApproved}
                        >
                          Voltar para pendente
                        </button>
                        <button
                          type="button"
                          className="btn secundario"
                          onClick={() => handleSavePermissions(item.user_id)}
                          disabled={loading || !isAdmin}
                        >
                          Salvar paginas
                        </button>
                        <button
                          type="button"
                          className="btn perigo"
                          onClick={() => handleDeleteAccess(item.user_id, item.email)}
                          disabled={loading || !isAdmin}
                        >
                          Excluir cadastro
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {records.length === 0 && <div className="empty-state">Nenhum usuario solicitou acesso ainda.</div>}
        </>
      )}

      <PageFooter />
    </main>
  );
}

function AdminAuditoriaPage({ isAdmin }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  useEffect(() => {
    let active = true;

    async function loadLogs() {
      setLoading(true);
      setError('');

      try {
        const result = await fetchAuditLogs(300);

        if (!active) {
          return;
        }

        setLogs(result);
        await writeAuditLog('admin_visualizou_auditoria', {
          totalRegistrosVisiveis: Array.isArray(result) ? result.length : 0
        });
      } catch (loadError) {
        if (active) {
          setError(loadError?.message || 'Nao foi possivel carregar os logs de auditoria.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    if (isAdmin) {
      loadLogs();
    } else {
      setLoading(false);
      setLogs([]);
      setError('Acesso restrito ao administrador.');
    }

    return () => {
      active = false;
    };
  }, [isAdmin]);

  async function recarregarLogs() {
    setLoading(true);
    setError('');
    setInfoMessage('');

    try {
      const result = await fetchAuditLogs(300);
      setLogs(result);
    } catch (loadError) {
      setError(loadError?.message || 'Nao foi possivel atualizar os logs.');
    } finally {
      setLoading(false);
    }
  }

  async function limparAcessos() {
    const confirmacao = window.confirm('Deseja realmente limpar os registros de acesso (login/logout)?');

    if (!confirmacao) {
      return;
    }

    setLoading(true);
    setError('');
    setInfoMessage('');

    try {
      const removidos = await clearAccessAuditLogs();
      const result = await fetchAuditLogs(300);
      setLogs(result);
      setInfoMessage(`Registros de acesso removidos: ${removidos}.`);
    } catch (loadError) {
      setError(loadError?.message || 'Nao foi possivel limpar os acessos.');
    } finally {
      setLoading(false);
    }
  }

  async function limparTudo() {
    const confirmacao1 = window.confirm('Esta acao vai limpar todos os registros da Auditoria Administrativa. Deseja continuar?');

    if (!confirmacao1) {
      return;
    }

    const confirmacao2 = window.confirm('Confirmacao final: todos os logs da auditoria serao apagados.');

    if (!confirmacao2) {
      return;
    }

    setLoading(true);
    setError('');
    setInfoMessage('');

    try {
      const removidos = await clearAllAuditLogs();
      setLogs([]);
      setInfoMessage(`Limpeza da auditoria concluida. Registros removidos: ${removidos}.`);
    } catch (loadError) {
      setError(loadError?.message || 'Nao foi possivel limpar os registros da auditoria.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page-shell">
      <Header title="Auditoria Administrativa" />

      <div className="page-actions">
        <LinkButton to="/">Voltar ao painel</LinkButton>
        <button type="button" className="btn secundario" onClick={recarregarLogs} disabled={loading || !isAdmin}>
          Atualizar
        </button>
        <button type="button" className="btn perigo" onClick={limparAcessos} disabled={loading || !isAdmin}>
          Limpar acessos
        </button>
        <button type="button" className="btn perigo" onClick={limparTudo} disabled={loading || !isAdmin}>
          Limpar auditoria
        </button>
      </div>

      {loading && <div className="alert alert-info">Carregando logs de auditoria...</div>}
      {error && <div className="alert alert-danger">{error}</div>}
      {infoMessage && <div className="alert alert-success">{infoMessage}</div>}

      {!loading && !error && (
        <>
          <section className="summary-cards">
            <article className="card">
              <span>Total de eventos</span>
              <strong>{logs.length}</strong>
            </article>
          </section>

          <table>
            <thead>
              <tr>
                <th>Data/Hora</th>
                <th>Usuario</th>
                <th>Acao</th>
                <th>Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((item) => (
                <tr key={item.id}>
                  <td data-label="Data/Hora">{item.created_at ? formatDateTime(new Date(item.created_at)) : '-'}</td>
                  <td data-label="Usuario">{item.actor_email || item.actor_id || '-'}</td>
                  <td data-label="Acao">{item.action || '-'}</td>
                  <td data-label="Detalhes" className="audit-details-cell">
                    <pre>{JSON.stringify(item.details || {}, null, 2)}</pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {logs.length === 0 && <div className="empty-state">Nenhum evento de auditoria registrado.</div>}
        </>
      )}

      <PageFooter />
    </main>
  );
}

function AuthUnavailablePage({ missingEnvVars }) {
  return (
    <main className="page-shell auth-shell">
      <Header title="Configuracao de seguranca pendente" />
      <div className="auth-card">
        <p>
          Para proteger o sistema com login e senha, configure as variaveis do Supabase no ambiente.
        </p>
        <ul>
          {missingEnvVars.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>
          Assim que elas estiverem definidas, recarregue a pagina para habilitar a autenticacao.
        </p>
      </div>
    </main>
  );
}

function AuthPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const submitLockRef = useRef(false);

  async function handleSubmit(event) {
    event.preventDefault();

    if (submitLockRef.current) {
      return;
    }

    submitLockRef.current = true;
    setError('');
    setMessage('');

    const safeEmail = email.trim();

    if (!safeEmail || !password) {
      setError('Preencha e-mail e senha.');
      return;
    }

    if (password.length < 8) {
      setError('Use uma senha com no minimo 8 caracteres.');
      return;
    }

    setLoading(true);

    try {
      if (isSignUp) {
        const result = await signUpWithPassword(safeEmail, password);

        if (result?.session) {
          setMessage('Conta criada e login realizado com sucesso. Se voce esperava confirmacao por e-mail, habilite essa opcao no painel do Supabase.');
        } else {
          setMessage('Conta criada. Verifique seu e-mail para confirmar o acesso.');
        }
      } else {
        await signInWithPassword(safeEmail, password);
      }
    } catch (authError) {
      const message = String(authError?.message || '').toLowerCase();

      if (message.includes('rate limit') || message.includes('too many requests')) {
        setError('Limite de envio de e-mail atingido. Aguarde alguns minutos antes de tentar novamente.');
      } else {
        setError(authError?.message || 'Nao foi possivel autenticar.');
      }
    } finally {
      setLoading(false);
      submitLockRef.current = false;
    }
  }

  return (
    <main className="page-shell auth-shell">
      <Header title="Acesso Seguro" />

      <section className="auth-card">
        <h2>{isSignUp ? 'Criar conta' : 'Entrar no sistema'}</h2>
        <p className="auth-subtitle">
          Acesso restrito por e-mail e senha para proteger os dados de manutencao.
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-field auth-field">
            <label htmlFor="auth-email">E-mail</label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="seuemail@empresa.com"
              required
            />
          </div>

          <div className="form-field auth-field">
            <label htmlFor="auth-password">Senha</label>
            <input
              id="auth-password"
              type="password"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimo 8 caracteres"
              required
            />
          </div>

          {error && <div className="alert alert-danger">{error}</div>}
          {message && <div className="alert alert-success">{message}</div>}

          <div className="form-actions auth-actions">
            <button type="submit" disabled={loading}>
              {loading ? 'Aguarde...' : isSignUp ? 'Criar conta' : 'Entrar'}
            </button>
            <button
              type="button"
              className="btn secundario"
              onClick={() => {
                setIsSignUp((value) => !value);
                setError('');
                setMessage('');
              }}
              disabled={loading}
            >
              {isSignUp ? 'Ja tenho conta' : 'Criar nova conta'}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

function AccessPendingPage({ email, status, onRefreshStatus, onSignOut }) {
  const isApproved = status === 'approved';

  if (isApproved) {
    return null;
  }

  return (
    <main className="page-shell auth-shell">
      <Header title="Aguardando liberacao" />

      <section className="auth-card">
        <h2>Acesso pendente de aprovacao</h2>
        <p className="auth-subtitle">
          A conta {email || 'informada'} foi criada com sucesso, mas o administrador ainda precisa liberar o acesso as paginas do sistema.
        </p>
        <div className="alert alert-info">
          Assim que o administrador aprovar, basta entrar novamente para acessar o painel.
        </div>

        <div className="form-actions auth-actions">
          <button type="button" onClick={onRefreshStatus}>Verificar liberacao</button>
          <button type="button" className="btn secundario" onClick={onSignOut}>Sair</button>
        </div>
      </section>
    </main>
  );
}

function AccessDeniedPage({ pageKey, allowedPageKeys }) {
  const allowedList = PAGE_ACCESS_OPTIONS.filter((item) => allowedPageKeys.includes(item.key));

  return (
    <main className="page-shell auth-shell">
      <Header title="Acesso restrito" />

      <section className="auth-card">
        <h2>Pagina sem liberacao</h2>
        <p className="auth-subtitle">
          Seu perfil nao possui permissao para acessar: <strong>{getPageLabelByKey(pageKey)}</strong>.
        </p>
        {allowedList.length > 0 ? (
          <>
            <div className="alert alert-info">Paginas disponiveis para seu perfil:</div>
            <div className="page-actions">
              {allowedList.map((item) => (
                <LinkButton key={item.key} to={item.path}>{item.label}</LinkButton>
              ))}
            </div>
          </>
        ) : (
          <div className="alert alert-info">
            Nenhuma pagina operacional foi liberada ainda. Solicite ajuste ao administrador.
          </div>
        )}
      </section>
    </main>
  );
}

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

function getEmptyCadastrosBase() {
  return {
    colaboradores: [],
    lideresTecnicos: [],
    ferramentas: [],
    veiculos: []
  };
}

function CadastrosBasePage() {
  const [cadastros, setCadastros] = useState(getEmptyCadastrosBase());
  const [novoColaborador, setNovoColaborador] = useState('');
  const [novoLiderTecnico, setNovoLiderTecnico] = useState('');
  const [novaFerramenta, setNovaFerramenta] = useState('');
  const [novoVeiculo, setNovoVeiculo] = useState('');

  useEffect(() => {
    let active = true;

    async function loadCadastros() {
      const data = await getCadastrosBase();

      if (!active) {
        return;
      }

      setCadastros(data);
    }

    loadCadastros();

    return () => {
      active = false;
    };
  }, []);

  async function persist(next) {
    const saved = await saveCadastrosBase(next);
    setCadastros(saved);
  }

  async function addItem(field, value, reset) {
    const safeValue = String(value || '').trim();

    if (!safeValue) {
      return;
    }

    if (cadastros[field].some((item) => normalizeText(item) === normalizeText(safeValue))) {
      window.alert('Item ja cadastrado nessa lista.');
      return;
    }

    const next = {
      ...cadastros,
      [field]: [...cadastros[field], safeValue]
    };

    await persist(next);
    reset('');
  }

  async function removeItem(field, value) {
    const next = {
      ...cadastros,
      [field]: cadastros[field].filter((item) => item !== value)
    };

    await persist(next);
  }

  return (
    <main className="page-shell">
      <Header title="Cadastros Base - Relatorio Eletrico" />

      <div className="page-actions">
        <LinkButton to="/relatorio-equipe-eletrica">Voltar ao Relatorio Equipe Eletrica</LinkButton>
      </div>

      <section className="summary-cards">
        <article className="card">
          <span>Colaboradores</span>
          <strong>{cadastros.colaboradores.length}</strong>
        </article>
        <article className="card">
          <span>Lideres Tecnicos</span>
          <strong>{cadastros.lideresTecnicos.length}</strong>
        </article>
        <article className="card">
          <span>Ferramentas</span>
          <strong>{cadastros.ferramentas.length}</strong>
        </article>
        <article className="card">
          <span>Veiculos</span>
          <strong>{cadastros.veiculos.length}</strong>
        </article>
      </section>

      <section className="summary-cards">
        <article className="card">
          <h2>Colaboradores</h2>
          <form className="ai-agent-form" onSubmit={(event) => {
            event.preventDefault();
            addItem('colaboradores', novoColaborador, setNovoColaborador);
          }}>
            <div className="form-field">
              <label>Nome</label>
              <input value={novoColaborador} onChange={(event) => setNovoColaborador(event.target.value)} />
            </div>
            <div className="form-actions">
              <button type="submit">Adicionar</button>
            </div>
          </form>
          <table>
            <tbody>
              {cadastros.colaboradores.map((item) => (
                <tr key={item}>
                  <td data-label="Colaborador">{item}</td>
                  <td data-label="Acoes">
                    <button type="button" className="btn excluir" onClick={() => removeItem('colaboradores', item)}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {cadastros.colaboradores.length === 0 && <div className="empty-state">Nenhum colaborador cadastrado.</div>}
        </article>

        <article className="card">
          <h2>Lider Tecnico</h2>
          <form className="ai-agent-form" onSubmit={(event) => {
            event.preventDefault();
            addItem('lideresTecnicos', novoLiderTecnico, setNovoLiderTecnico);
          }}>
            <div className="form-field">
              <label>Nome</label>
              <input value={novoLiderTecnico} onChange={(event) => setNovoLiderTecnico(event.target.value)} />
            </div>
            <div className="form-actions">
              <button type="submit">Adicionar</button>
            </div>
          </form>
          <table>
            <tbody>
              {cadastros.lideresTecnicos.map((item) => (
                <tr key={item}>
                  <td data-label="Lider Tecnico">{item}</td>
                  <td data-label="Acoes">
                    <button type="button" className="btn excluir" onClick={() => removeItem('lideresTecnicos', item)}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {cadastros.lideresTecnicos.length === 0 && <div className="empty-state">Nenhum lider tecnico cadastrado.</div>}
        </article>
      </section>

      <section className="summary-cards">
        <article className="card">
          <h2>Ferramenta</h2>
          <form className="ai-agent-form" onSubmit={(event) => {
            event.preventDefault();
            addItem('ferramentas', novaFerramenta, setNovaFerramenta);
          }}>
            <div className="form-field">
              <label>Nome</label>
              <input value={novaFerramenta} onChange={(event) => setNovaFerramenta(event.target.value)} />
            </div>
            <div className="form-actions">
              <button type="submit">Adicionar</button>
            </div>
          </form>
          <table>
            <tbody>
              {cadastros.ferramentas.map((item) => (
                <tr key={item}>
                  <td data-label="Ferramenta">{item}</td>
                  <td data-label="Acoes">
                    <button type="button" className="btn excluir" onClick={() => removeItem('ferramentas', item)}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {cadastros.ferramentas.length === 0 && <div className="empty-state">Nenhuma ferramenta cadastrada.</div>}
        </article>

        <article className="card">
          <h2>Veiculos</h2>
          <form className="ai-agent-form" onSubmit={(event) => {
            event.preventDefault();
            addItem('veiculos', novoVeiculo, setNovoVeiculo);
          }}>
            <div className="form-field">
              <label>Nome</label>
              <input value={novoVeiculo} onChange={(event) => setNovoVeiculo(event.target.value)} />
            </div>
            <div className="form-actions">
              <button type="submit">Adicionar</button>
            </div>
          </form>
          <table>
            <tbody>
              {cadastros.veiculos.map((item) => (
                <tr key={item}>
                  <td data-label="Veiculo">{item}</td>
                  <td data-label="Acoes">
                    <button type="button" className="btn excluir" onClick={() => removeItem('veiculos', item)}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {cadastros.veiculos.length === 0 && <div className="empty-state">Nenhum veiculo cadastrado.</div>}
        </article>
      </section>

      <PageFooter />
    </main>
  );
}

function DashboardPage({ pagePermissions }) {
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
        {pagePermissions.historico && <LinkButton to="/historico">Ver Gestao de Parada da Manutencao</LinkButton>}
        {pagePermissions['relatorio-turnos'] && <LinkButton to="/relatorio-turnos">Relatorio por Turno</LinkButton>}
        {pagePermissions['relatorio-equipe-eletrica'] && <LinkButton to="/relatorio-equipe-eletrica">Relatorio Equipe Eletrica</LinkButton>}
        {pagePermissions['historico-opcoes'] && <LinkButton to="/historico-opcoes">Historico por Opcao</LinkButton>}
        {pagePermissions['dashboard-turnos'] && <LinkButton to="/dashboard-turnos">Dashboard por Turno</LinkButton>}
        {pagePermissions['agente-ia'] && <LinkButton to="/agente-ia">Agente IA</LinkButton>}
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

function RelatorioEquipeEletricaPage() {
  const [relatorios, setRelatorios] = useState([]);
  const [colaboradoresCadastrados, setColaboradoresCadastrados] = useState([]);
  const [lideresTecnicosCadastrados, setLideresTecnicosCadastrados] = useState([]);
  const [ferramentasCadastradas, setFerramentasCadastradas] = useState([]);
  const [veiculosCadastrados, setVeiculosCadastrados] = useState([]);
  const [editId, setEditId] = useState(null);

  function getEmptyDescricaoAtividade() {
    return {
      descricao: '',
      equipamento: '',
      tagEquipamento: '',
      tipoServico: '',
      ordemServico: ''
    };
  }

  const [formData, setFormData] = useState({
    dataRelatorio: '',
    turno: '',
    turma: '',
    liderTecnico: '',
    descricaoAtividades: [getEmptyDescricaoAtividade()],
    executantes: [''],
    ferramentas: [''],
    veiculos: ['']
  });

  function normalizeExecutantesList(value) {
    if (Array.isArray(value)) {
      const cleaned = value
        .map((item) => String(item || '').trim())
        .filter(Boolean);

      return cleaned.length > 0 ? [...new Set(cleaned)] : [''];
    }

    const fromText = String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    return fromText.length > 0 ? [...new Set(fromText)] : [''];
  }

  function normalizeFerramentasList(value) {
    if (Array.isArray(value)) {
      const cleaned = value
        .map((item) => String(item || '').trim())
        .filter(Boolean);

      return cleaned.length > 0 ? [...new Set(cleaned)] : [''];
    }

    const fromText = String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    return fromText.length > 0 ? [...new Set(fromText)] : [''];
  }

  function normalizeVeiculosList(value) {
    if (Array.isArray(value)) {
      const cleaned = value
        .map((item) => String(item || '').trim())
        .filter(Boolean);

      return cleaned.length > 0 ? [...new Set(cleaned)] : [''];
    }

    const fromText = String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    return fromText.length > 0 ? [...new Set(fromText)] : [''];
  }

  function normalizeDescricaoAtividadesList(value) {
    function toSafeItem(item) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const descricao = String(item.descricao || item.texto || '').trim();
        const equipamento = String(item.equipamento || '').trim();
        const tagEquipamento = String(item.tagEquipamento || item.tag || '').trim();
        const tipoServico = String(item.tipoServico || item.tipoDeServico || '').trim();
        const ordemServico = String(item.ordemServico || item.os || '').trim();

        return {
          descricao,
          equipamento,
          tagEquipamento,
          tipoServico,
          ordemServico
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

  useEffect(() => {
    let active = true;

    async function loadRelatorios() {
      const [data, cadastros] = await Promise.all([
        getRelatorioEquipeEletrica(),
        getCadastrosBase()
      ]);

      if (!active) {
        return;
      }

      setRelatorios(Array.isArray(data) ? data : []);
      setColaboradoresCadastrados(Array.isArray(cadastros?.colaboradores) ? cadastros.colaboradores : []);
      setLideresTecnicosCadastrados(Array.isArray(cadastros?.lideresTecnicos) ? cadastros.lideresTecnicos : []);
      setFerramentasCadastradas(Array.isArray(cadastros?.ferramentas) ? cadastros.ferramentas : []);
      setVeiculosCadastrados(Array.isArray(cadastros?.veiculos) ? cadastros.veiculos : []);
    }

    loadRelatorios();

    return () => {
      active = false;
    };
  }, []);

  function resetForm() {
    setEditId(null);
    setFormData({
      dataRelatorio: '',
      turno: '',
      turma: '',
      liderTecnico: '',
      descricaoAtividades: [getEmptyDescricaoAtividade()],
      executantes: [''],
      ferramentas: [''],
      veiculos: ['']
    });
  }

  function updateDescricaoAtividade(index, field, value) {
    setFormData((current) => ({
      ...current,
      descricaoAtividades: current.descricaoAtividades.map((item, currentIndex) => (
        currentIndex === index ? { ...item, [field]: value } : item
      ))
    }));
  }

  function addDescricaoAtividadeField() {
    setFormData((current) => ({
      ...current,
      descricaoAtividades: [...current.descricaoAtividades, getEmptyDescricaoAtividade()]
    }));
  }

  function removeDescricaoAtividadeField(index) {
    setFormData((current) => {
      const next = current.descricaoAtividades.filter((_, currentIndex) => currentIndex !== index);

      return {
        ...current,
        descricaoAtividades: next.length > 0 ? next : [getEmptyDescricaoAtividade()]
      };
    });
  }

  function updateExecutante(index, value) {
    setFormData((current) => ({
      ...current,
      executantes: current.executantes.map((item, currentIndex) => (
        currentIndex === index ? value : item
      ))
    }));
  }

  function addExecutanteField() {
    setFormData((current) => ({
      ...current,
      executantes: [...current.executantes, '']
    }));
  }

  function removeExecutanteField(index) {
    setFormData((current) => {
      const next = current.executantes.filter((_, currentIndex) => currentIndex !== index);

      return {
        ...current,
        executantes: next.length > 0 ? next : ['']
      };
    });
  }

  function updateFerramenta(index, value) {
    setFormData((current) => ({
      ...current,
      ferramentas: current.ferramentas.map((item, currentIndex) => (
        currentIndex === index ? value : item
      ))
    }));
  }

  function addFerramentaField() {
    setFormData((current) => ({
      ...current,
      ferramentas: [...current.ferramentas, '']
    }));
  }

  function removeFerramentaField(index) {
    setFormData((current) => {
      const next = current.ferramentas.filter((_, currentIndex) => currentIndex !== index);

      return {
        ...current,
        ferramentas: next.length > 0 ? next : ['']
      };
    });
  }

  function updateVeiculo(index, value) {
    setFormData((current) => ({
      ...current,
      veiculos: current.veiculos.map((item, currentIndex) => (
        currentIndex === index ? value : item
      ))
    }));
  }

  function addVeiculoField() {
    setFormData((current) => ({
      ...current,
      veiculos: [...current.veiculos, '']
    }));
  }

  function removeVeiculoField(index) {
    setFormData((current) => {
      const next = current.veiculos.filter((_, currentIndex) => currentIndex !== index);

      return {
        ...current,
        veiculos: next.length > 0 ? next : ['']
      };
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const descricaoAtividades = normalizeDescricaoAtividadesList(formData.descricaoAtividades);

    const payload = {
      id: editId ?? Date.now(),
      dataRelatorio: formData.dataRelatorio,
      turno: formData.turno,
      turma: formData.turma,
      liderTecnico: formData.liderTecnico.trim(),
      descricaoAtividades,
      descricaoAtividade: descricaoAtividades
        .map((item) => item.descricao)
        .filter(Boolean)
        .join('\n'),
      executantes: normalizeExecutantesList(formData.executantes),
      ferramentas: normalizeFerramentasList(formData.ferramentas),
      veiculos: normalizeVeiculosList(formData.veiculos)
    };

    const next = editId === null
      ? [payload, ...relatorios]
      : relatorios.map((item) => (item.id === editId ? { ...item, ...payload } : item));

    setRelatorios(next);
    await saveRelatorioEquipeEletrica(next);
    resetForm();
  }

  function editarRelatorio(item) {
    setEditId(item.id);
    setFormData({
      dataRelatorio: item.dataRelatorio || '',
      turno: item.turno || '',
      turma: item.turma || '',
      liderTecnico: item.liderTecnico || '',
      descricaoAtividades: normalizeDescricaoAtividadesList(
        item.descricaoAtividades || item.descricaoAtividade
      ),
      executantes: normalizeExecutantesList(item.executantes),
      ferramentas: normalizeFerramentasList(item.ferramentas),
      veiculos: normalizeVeiculosList(item.veiculos)
    });
  }

  async function excluirRelatorio(id) {
    const next = relatorios.filter((item) => item.id !== id);
    setRelatorios(next);
    await saveRelatorioEquipeEletrica(next);
  }

  async function limparRelatorios() {
    const confirmacao = window.confirm('Deseja realmente limpar todos os relatorios da equipe eletrica?');

    if (!confirmacao) {
      return;
    }

    setRelatorios([]);
    await saveRelatorioEquipeEletrica([]);
    resetForm();
  }

  return (
    <main className="page-shell">
      <Header title="Relatorio Equipe Eletrica" />

      <div className="page-actions">
        <LinkButton to="/">Voltar ao painel</LinkButton>
        <LinkButton to="/cadastros-base">Ir para Cadastros Base</LinkButton>
        <button type="button" className="btn perigo" onClick={limparRelatorios}>Limpar relatorios</button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-field">
          <label>Data do Relatorio</label>
          <input
            type="date"
            value={formData.dataRelatorio}
            onChange={(event) => setFormData({ ...formData, dataRelatorio: event.target.value })}
          />
        </div>
        <div className="form-field form-field-wide">
          <label>Turno</label>
          <select
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
        <div className="form-field form-field-wide">
          <label>Turma</label>
          <select
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
          <label>Lider Tecnico</label>
          <input
            value={formData.liderTecnico}
            onChange={(event) => setFormData({ ...formData, liderTecnico: event.target.value })}
            placeholder="Nome do lider tecnico"
            list="lideres-tecnicos-cadastrados-eletrica"
          />
          <datalist id="lideres-tecnicos-cadastrados-eletrica">
            {lideresTecnicosCadastrados.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        </div>
        <div className="form-field compact-list-field">
          <label>Executantes</label>
          <div className="executantes-grid">
            {formData.executantes.map((executante, index) => (
              <div key={`executante-${index}`} className="executante-row compact-row">
                <input
                  value={executante}
                  onChange={(event) => updateExecutante(index, event.target.value)}
                  placeholder={`Executante ${index + 1}`}
                  list="colaboradores-cadastrados-eletrica"
                />
                <button
                  type="button"
                  className="btn excluir"
                  onClick={() => removeExecutanteField(index)}
                >
                  Remover
                </button>
              </div>
            ))}
            <datalist id="colaboradores-cadastrados-eletrica">
              {colaboradoresCadastrados.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </div>
          <div className="form-actions">
            <button type="button" className="btn secundario" onClick={addExecutanteField}>Adicionar executante</button>
          </div>
        </div>
        <div className="form-field compact-list-field">
          <label>Ferramentas</label>
          <div className="executantes-grid">
            {formData.ferramentas.map((ferramenta, index) => (
              <div key={`ferramenta-${index}`} className="executante-row compact-row">
                <input
                  value={ferramenta}
                  onChange={(event) => updateFerramenta(index, event.target.value)}
                  placeholder={`Ferramenta ${index + 1}`}
                  list="ferramentas-cadastradas-eletrica"
                />
                <button
                  type="button"
                  className="btn excluir"
                  onClick={() => removeFerramentaField(index)}
                >
                  Remover
                </button>
              </div>
            ))}
            <datalist id="ferramentas-cadastradas-eletrica">
              {ferramentasCadastradas.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </div>
          <div className="form-actions">
            <button type="button" className="btn secundario" onClick={addFerramentaField}>Adicionar ferramenta</button>
          </div>
        </div>
        <div className="form-field compact-list-field">
          <label>Veiculos</label>
          <div className="executantes-grid">
            {formData.veiculos.map((veiculo, index) => (
              <div key={`veiculo-${index}`} className="executante-row compact-row">
                <input
                  value={veiculo}
                  onChange={(event) => updateVeiculo(index, event.target.value)}
                  placeholder={`Veiculo ${index + 1}`}
                  list="veiculos-cadastrados-eletrica"
                />
                <button
                  type="button"
                  className="btn excluir"
                  onClick={() => removeVeiculoField(index)}
                >
                  Remover
                </button>
              </div>
            ))}
            <datalist id="veiculos-cadastrados-eletrica">
              {veiculosCadastrados.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </div>
          <div className="form-actions">
            <button type="button" className="btn secundario" onClick={addVeiculoField}>Adicionar veiculo</button>
          </div>
        </div>
        <div className="form-field descricao-atividade-field">
          <label>Descricao da Atividade</label>
          <div className="executantes-grid">
            {formData.descricaoAtividades.map((descricao, index) => (
              <div key={`descricao-atividade-${index}`} className="atividade-item">
                <div className="atividade-meta-grid">
                  <input
                    value={descricao.equipamento}
                    onChange={(event) => updateDescricaoAtividade(index, 'equipamento', event.target.value)}
                    placeholder="Equipamento (opcional)"
                  />
                  <input
                    value={descricao.tagEquipamento}
                    onChange={(event) => updateDescricaoAtividade(index, 'tagEquipamento', event.target.value)}
                    placeholder="Tag do Equipamento (opcional)"
                  />
                  <input
                    value={descricao.tipoServico}
                    onChange={(event) => updateDescricaoAtividade(index, 'tipoServico', event.target.value)}
                    placeholder="Tipo de Servico (opcional)"
                  />
                  <input
                    value={descricao.ordemServico}
                    onChange={(event) => updateDescricaoAtividade(index, 'ordemServico', event.target.value)}
                    placeholder="Ordem de Servico (opcional)"
                  />
                </div>
                <div className="executante-row compact-row">
                  <textarea
                    value={descricao.descricao}
                    onChange={(event) => updateDescricaoAtividade(index, 'descricao', event.target.value)}
                    placeholder="Descreva a atividade realizada"
                    rows={5}
                  />
                  <button
                    type="button"
                    className="btn excluir"
                    onClick={() => removeDescricaoAtividadeField(index)}
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="form-actions">
            <button type="button" className="btn secundario" onClick={addDescricaoAtividadeField}>Adicionar novo campo</button>
          </div>
        </div>
        <div className="form-actions">
          <button type="submit">{editId === null ? 'Salvar relatorio' : 'Salvar edicao'}</button>
          <button type="button" className="btn secundario" onClick={resetForm}>Limpar formulario</button>
        </div>
      </form>

      <PageFooter />
    </main>
  );
}

function AgenteIAPage() {
  const [historicoParadas, setHistoricoParadas] = useState([]);
  const [pergunta, setPergunta] = useState('');
  const [resposta, setResposta] = useState(null);

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

    return () => {
      active = false;
    };
  }, []);

  const baseParadas = useMemo(() => toParadaBase(historicoParadas), [historicoParadas]);

  const rankingPaineis = useMemo(() => {
    return groupParadasBy(baseParadas, 'nome').slice(0, 5);
  }, [baseParadas]);

  const totalMinutos = useMemo(() => {
    return baseParadas.reduce((total, item) => total + getDurationInMinutes(item), 0);
  }, [baseParadas]);

  function enviarPergunta(event) {
    event.preventDefault();
    setResposta(buildAgentReply(pergunta, historicoParadas));
  }

  function usarSugestao(texto) {
    setPergunta(texto);
    setResposta(buildAgentReply(texto, historicoParadas));
  }

  return (
    <main className="page-shell">
      <Header title="Agente IA - Perguntas Rapidas" />

      <div className="page-actions">
        <LinkButton to="/">Voltar ao painel</LinkButton>
      </div>

      <section className="summary-cards">
        <article className="card">
          <span>Paradas analisadas</span>
          <strong>{baseParadas.length}</strong>
        </article>
        <article className="card">
          <span>Tempo total de parada</span>
          <strong>{formatMinutes(totalMinutos)}</strong>
        </article>
      </section>

      <section className="card ai-agent-box">
        <h2>Faca sua pergunta</h2>
        <form className="ai-agent-form" onSubmit={enviarPergunta}>
          <div className="form-field form-field-wide">
            <label htmlFor="perguntaIa">Pergunta</label>
            <textarea
              id="perguntaIa"
              rows="3"
              placeholder="Ex.: qual painel teve mais parada?"
              value={pergunta}
              onChange={(event) => setPergunta(event.target.value)}
            />
          </div>
          <div className="form-actions">
            <button type="submit">Perguntar ao agente</button>
          </div>
        </form>

        <div className="ai-agent-suggestions" aria-label="Sugestoes de perguntas">
          <button type="button" className="btn secundario" onClick={() => usarSugestao('qual painel teve mais parada?')}>Qual painel teve mais parada?</button>
          <button type="button" className="btn secundario" onClick={() => usarSugestao('qual turno teve mais parada?')}>Qual turno teve mais parada?</button>
          <button type="button" className="btn secundario" onClick={() => usarSugestao('qual turma teve mais parada?')}>Qual turma teve mais parada?</button>
          <button type="button" className="btn secundario" onClick={() => usarSugestao('qual o tempo total de parada?')}>Qual o tempo total de parada?</button>
        </div>

        {resposta && (
          <article className="ai-answer-card">
            <h3>{resposta.title}</h3>
            <p>{resposta.content}</p>
          </article>
        )}
      </section>

      <h2>Ranking de paineis com mais paradas</h2>
      <table>
        <thead>
          <tr>
            <th>Painel</th>
            <th>Total de paradas</th>
            <th>Tempo acumulado</th>
          </tr>
        </thead>
        <tbody>
          {rankingPaineis.map((item) => (
            <tr key={item.label}>
              <td data-label="Painel">{item.label}</td>
              <td data-label="Total de paradas">{item.quantidade}</td>
              <td data-label="Tempo acumulado">{formatMinutes(item.minutos)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {rankingPaineis.length === 0 && <div className="empty-state">Nenhuma parada registrada para analise.</div>}

      <PageFooter />
    </main>
  );
}

export default function App() {
  const storageStatus = useMemo(() => getStorageStatus(), []);
  const [authLoading, setAuthLoading] = useState(storageStatus.authEnabled);
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [accessProfile, setAccessProfile] = useState(null);
  const [accessVersion, setAccessVersion] = useState(0);

  useEffect(() => {
    if (!storageStatus.authEnabled) {
      setAuthLoading(false);
      return () => {};
    }

    let active = true;

    async function refreshAuthorization(nextSession) {
      if (!nextSession) {
        if (active) {
          setIsAdmin(false);
          setAccessProfile(null);
        }
        return;
      }

      try {
        const admin = await getIsCurrentUserAdmin();

        if (admin) {
          if (active) {
            setIsAdmin(true);
            setAccessProfile({
              status: 'approved',
              allowed_pages: [...PAGE_ACCESS_KEYS]
            });
          }
          return;
        }

        const access = await getCurrentUserAccessProfile();

        if (active) {
          setIsAdmin(false);
          setAccessProfile(access);
        }
      } catch {
        if (active) {
          setIsAdmin(false);
          setAccessProfile({
            status: 'pending',
            allowed_pages: []
          });
        }
      }
    }

    async function applySession(nextSession) {
      if (!active) {
        return;
      }

      setSession(nextSession);

      if (!nextSession) {
        setIsAdmin(false);
        setAccessProfile(null);
        setAuthLoading(false);
        return;
      }

      setAuthLoading(true);

      try {
        await refreshAuthorization(nextSession);
      } finally {
        if (active) {
          setAuthLoading(false);
        }
      }
    }

    async function initSession() {
      try {
        const currentSession = await getCurrentSession();

        await applySession(currentSession);
      } catch {
        if (active) {
          setSession(null);
          setIsAdmin(false);
          setAccessProfile(null);
        }
      } finally {
        if (active) {
          setAuthLoading(false);
        }
      }
    }

    initSession();

    const unsubscribe = subscribeAuthChanges((nextSession) => {
      applySession(nextSession);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [accessVersion, storageStatus.authEnabled]);

  async function handleSignOut() {
    await signOut();
    setSession(null);
    setIsAdmin(false);
    setAccessProfile(null);
  }

  function handleRefreshAccess() {
    setAuthLoading(true);
    setAccessVersion((value) => value + 1);
  }

  if (authLoading) {
    return (
      <main className="page-shell auth-shell">
        <Header title="Validando acesso" />
        <div className="auth-card">
          <p>Carregando sessao de seguranca...</p>
        </div>
      </main>
    );
  }

  if (!storageStatus.authEnabled) {
    return <AuthUnavailablePage missingEnvVars={storageStatus.missingEnvVars} />;
  }

  if (!session) {
    return <AuthPage />;
  }

  if (!isAdmin && accessProfile?.status !== 'approved') {
    return (
      <AccessPendingPage
        email={session?.user?.email}
        status={accessProfile?.status}
        onRefreshStatus={handleRefreshAccess}
        onSignOut={handleSignOut}
      />
    );
  }

  const allowedPages = isAdmin
    ? [...PAGE_ACCESS_KEYS]
    : normalizeAllowedPages(accessProfile?.allowed_pages || []);
  const pagePermissions = PAGE_ACCESS_KEYS.reduce((acc, key) => {
    acc[key] = isAdmin || allowedPages.includes(key);
    return acc;
  }, {});

  function renderProtectedPage(pageKey, element) {
    if (isAdmin || pagePermissions[pageKey]) {
      return element;
    }

    return <AccessDeniedPage pageKey={pageKey} allowedPageKeys={allowedPages} />;
  }

  return (
    <>
      <SessionBar email={session?.user?.email} isAdmin={isAdmin} onSignOut={handleSignOut} />
      <Routes>
        <Route path="/" element={renderProtectedPage('dashboard', <DashboardPage pagePermissions={pagePermissions} />)} />
        <Route path="/historico" element={renderProtectedPage('historico', <HistoricoPage />)} />
        <Route path="/relatorio-turnos" element={renderProtectedPage('relatorio-turnos', <RelatorioPorTurnoPage />)} />
        <Route path="/relatorio-equipe-eletrica" element={renderProtectedPage('relatorio-equipe-eletrica', <RelatorioEquipeEletricaPage />)} />
        <Route path="/cadastros-base" element={renderProtectedPage('relatorio-equipe-eletrica', <CadastrosBasePage />)} />
        <Route path="/historico-opcoes" element={renderProtectedPage('historico-opcoes', <HistoricoOpcoesPage />)} />
        <Route path="/dashboard-turnos" element={renderProtectedPage('dashboard-turnos', <DashboardTurnosPage />)} />
        <Route path="/agente-ia" element={renderProtectedPage('agente-ia', <AgenteIAPage />)} />
        <Route path="/admin-acessos" element={<AdminAccessPage isAdmin={isAdmin} />} />
        <Route path="/admin-auditoria" element={<AdminAuditoriaPage isAdmin={isAdmin} />} />
      </Routes>
    </>
  );
}
