const teamBody = document.getElementById('equipe-body');
const addTeamRowButton = document.getElementById('add-team-row');

// Mapeia cada valor do select para uma classe CSS de estilo visual.
const statusClassMap = {
    '': 'status-empty',
    atestado: 'status-atestado',
    presente: 'status-presente',
    ferias: 'status-ferias',
    ausente: 'status-ausente'
};

function applyStatusClass(selectElement) {
    // Remove classes antigas para evitar conflito de estilos.
    Object.values(statusClassMap).forEach((className) => {
        selectElement.classList.remove(className);
    });

    // Aplica a classe correspondente ao status selecionado.
    selectElement.classList.add(statusClassMap[selectElement.value]);
}

function createTeamRow() {
    // Cria uma nova linha da tabela com campos vazios.
    const row = document.createElement('tr');
    row.innerHTML = `
        <td><input type="text" placeholder="Nome do membro"></td>
        <td><input type="text" placeholder="Matrícula"></td>
        <td><input type="text" placeholder="Horário"></td>
        <td>
            <select class="status-select" aria-label="Status do membro">
                <option value="">Opcional</option>
                <option value="atestado">Atestado</option>
                <option value="presente">Presente</option>
                <option value="ferias">Férias</option>
                <option value="ausente">Ausente</option>
            </select>
        </td>
        <td class="action-column"><button type="button" class="remove-row">Remover</button></td>
    `;

    // Inicializa cor/estilo do select e atualiza quando houver mudança.
    const statusSelect = row.querySelector('.status-select');
    applyStatusClass(statusSelect);
    statusSelect.addEventListener('change', () => applyStatusClass(statusSelect));

    return row;
}

// Prepara os selects que já existem na página ao carregar.
teamBody.querySelectorAll('.status-select').forEach((statusSelect) => {
    applyStatusClass(statusSelect);
    statusSelect.addEventListener('change', () => applyStatusClass(statusSelect));
});

// Adiciona nova linha de membro ao clicar no botão.
addTeamRowButton.addEventListener('click', () => {
    teamBody.appendChild(createTeamRow());
});

// Remove a linha clicada, mantendo pelo menos 1 linha na tabela.
teamBody.addEventListener('click', (event) => {
    const removeButton = event.target.closest('.remove-row');
    if (!removeButton) {
        return;
    }

    const row = removeButton.closest('tr');
    if (row && teamBody.children.length > 1) {
        row.remove();
    }
});
