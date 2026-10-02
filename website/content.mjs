export const repository = 'https://github.com/i-9-ai/skills';
export const documentation = repository + '/wiki';

// Registry releases passed anonymous fresh-cache CLI checks; the initial release also passed MCP checks.
export const toolkitSource = 'registry';
export const commands = {
    skills: 'npx skills add i-9-ai/skills --yes',
    plugin:
        'codex plugin marketplace add i-9-ai/skills --ref main\n' +
        'codex plugin add i9-skills@i9-skills\n' +
        'codex plugin list',
    toolkit:
        toolkitSource === 'registry'
            ? 'npx --yes @i-9.ai/skills catalog overview'
            : 'npx --yes --allow-git=root github:i-9-ai/skills catalog overview',
};

export const categories = {
    create: [
        'skill-authoring',
        'skill-design',
        'skill-domain-research',
        'skill-icon-design',
        'skill-naming',
        'skills-discovery',
        'skills-synthesis',
    ],
    evaluate: [
        'skill-evaluator',
        'skill-lifecycle-review',
        'skill-security-review',
        'skills-host-compatibility',
    ],
    manage: [
        'skill-routing',
        'skills-usage-setup',
        'skills-audit',
        'skills-catalog',
        'skills-catalog-index',
        'skills-maintenance-scheduling',
        'skills-refactoring',
        'skills-snapshot',
    ],
    evolve: ['skill-evidence-collection', 'skill-evolution', 'skill-optimization'],
    distribute: ['skill-installation', 'skill-migration', 'skill-publication'],
};

export const languages = [
    { key: 'en', tag: 'en', short: 'EN', name: 'English' },
    { key: 'pt-br', tag: 'pt-BR', short: 'PT', name: 'Português' },
    { key: 'es', tag: 'es', short: 'ES', name: 'Español' },
];

export const messages = {
    en: {
        title: 'I-9 Skills — Focused agent skills, by design',
        description:
            'Create, evaluate and evolve agent skills with focused packages, a portable core and explicit evidence.',
        skip: 'Skip to content',
        navigation: 'Main navigation',
        language: 'Choose language',
        languageSuggestion: {
            message: 'Your browser prefers English. View this page in English?',
            action: 'View in English',
            dismiss: 'Not now',
        },
        nav: { workflow: 'Workflow', catalog: 'Catalog', install: 'Install', docs: 'Docs' },
        hero: {
            title: 'Better skills.',
            emphasis: 'By design.',
            description:
                'Create, evaluate and evolve agent skills. One responsibility. One reviewable output.',
            primary: 'Explore the catalog',
            secondary: 'Choose your install path',
            count: 'focused meta-skills',
            license: 'Apache-2.0',
            portable: 'Portable core',
        },
        workflow: {
            title: 'Start anywhere.',
            emphasis: 'Improve deliberately.',
            description: 'Keep what works. Change one responsibility at a time.',
            stages: [
                {
                    title: 'Create',
                    body: 'Find the job. Research the domain. Build a complete package.',
                    skill: 'skill-authoring',
                },
                {
                    title: 'Verify',
                    body: 'Evaluate behavior, security and declared compatibility.',
                    skill: 'skill-evaluator',
                },
                {
                    title: 'Improve',
                    body: 'Audit what exists. Keep evidence. Evolve the smallest useful change.',
                    skill: 'skills-audit',
                },
                {
                    title: 'Distribute',
                    body: 'Choose an approved package and a deliberate distribution path.',
                    skill: 'skill-publication',
                },
            ],
        },
        catalog: {
            title: 'Find the skill',
            emphasis: 'for the job.',
            description: 'Focused packages for the full life of an agent skill.',
            source: 'View source catalog',
            search: 'Search skills',
            placeholder: 'Name, responsibility or keyword',
            filters: 'Filter by responsibility',
            all: 'All',
            categories: {
                create: 'Create',
                evaluate: 'Evaluate',
                manage: 'Manage',
                evolve: 'Evolve',
                distribute: 'Distribute',
            },
            count: 'skills',
            singular: 'skill',
            reset: 'Clear filters',
            empty: 'No skills match this search.',
            emptyHint: 'Try another responsibility or clear the filters.',
            sourceDescription: '',
            open: 'Read package source',
            noScript:
                'The complete catalog is available below. Search and filters require JavaScript.',
        },
        install: {
            title: 'Your agent.',
            emphasis: 'Your install path.',
            description:
                'Portable skills, a host plugin, or the toolkit CLI. Choose what you need.',
            packages: 'Portable packages',
            packagesBody:
                'Install skills for your chosen agent in this project. Host hooks are a separate integration.',
            packagesLink: 'Scopes and supported agents',
            plugin: 'Codex plugin',
            pluginBody: 'Skills, session hook and catalog MCP. Requires Codex CLI and Node.js 24+.',
            pluginLink: 'Desktop, updates and removal',
            toolkit: 'Toolkit CLI',
            toolkitBody: 'Run catalog and skill management commands with Node.js 24+.',
            toolkitGit:
                'Git-source preview: requires Git and preparation dependencies. Registry availability is not claimed here.',
            toolkitRegistry:
                'Published registry package; running the CLI is separate from installing skills.',
            toolkitLink: 'Command reference',
            copy: 'Copy',
            copied: 'Copied',
            copyFailure: 'Copy unavailable. Select the command and copy it manually.',
            copyLabel: 'Copy command',
        },
        evidence: {
            title: 'Evidence before confidence.',
            items: [
                { title: 'Portable core', body: 'Agent Skills Markdown and bundled resources.' },
                {
                    title: 'Explicit limits',
                    body: 'Structural checks and provider pilots cover different things.',
                },
                {
                    title: 'Still experimental',
                    body: 'No universal compatibility or production-quality claim.',
                },
            ],
            link: 'Read compatibility and evidence',
            providers:
                'Codex and Claude plugin pilots exercise selected native paths. Copilot CLI evidence covers ephemeral legacy-plugin MCP discovery and direct calls, without a model turn or persistent installation. Icons and hooks remain host-dependent.',
        },
        footer: {
            source: 'GitHub',
            docs: 'Documentation',
            license: 'Apache-2.0',
            privacy: 'Privacy',
            terms: 'Terms',
            preview: 'Review build. Production awaits the approved merge.',
        },
    },
    'pt-br': {
        title: 'I-9 Skills — Skills focadas, por design',
        description:
            'Crie, avalie e evolua skills de agentes com pacotes focados, um núcleo portátil e evidências explícitas.',
        skip: 'Ir para o conteúdo',
        navigation: 'Navegação principal',
        language: 'Escolher idioma',
        languageSuggestion: {
            message: 'Seu navegador prefere português. Quer ver esta página em português?',
            action: 'Ver em português',
            dismiss: 'Agora não',
        },
        nav: { workflow: 'Fluxo', catalog: 'Catálogo', install: 'Instalar', docs: 'Docs' },
        hero: {
            title: 'Skills melhores.',
            emphasis: 'Por design.',
            description:
                'Crie, avalie e evolua skills de agentes. Uma responsabilidade. Um resultado revisável.',
            primary: 'Explorar o catálogo',
            secondary: 'Escolher como instalar',
            count: 'meta-skills focadas',
            license: 'Apache-2.0',
            portable: 'Núcleo portátil',
        },
        workflow: {
            title: 'Comece por onde precisar.',
            emphasis: 'Melhore com intenção.',
            description: 'Preserve o que funciona. Mude uma responsabilidade por vez.',
            stages: [
                {
                    title: 'Criar',
                    body: 'Defina a tarefa. Pesquise o domínio. Crie um pacote completo.',
                    skill: 'skill-authoring',
                },
                {
                    title: 'Verificar',
                    body: 'Avalie comportamento, segurança e compatibilidade declarada.',
                    skill: 'skill-evaluator',
                },
                {
                    title: 'Melhorar',
                    body: 'Audite o que existe. Preserve evidências. Evolua a menor mudança útil.',
                    skill: 'skills-audit',
                },
                {
                    title: 'Distribuir',
                    body: 'Escolha um pacote aprovado e uma distribuição deliberada.',
                    skill: 'skill-publication',
                },
            ],
        },
        catalog: {
            title: 'A skill certa',
            emphasis: 'para cada tarefa.',
            description: 'Pacotes focados para todo o ciclo de vida de uma skill de agente.',
            source: 'Ver catálogo-fonte',
            search: 'Buscar skills',
            placeholder: 'Nome, responsabilidade ou palavra-chave',
            filters: 'Filtrar por responsabilidade',
            all: 'Todas',
            categories: {
                create: 'Criar',
                evaluate: 'Avaliar',
                manage: 'Gerenciar',
                evolve: 'Evoluir',
                distribute: 'Distribuir',
            },
            count: 'skills',
            singular: 'skill',
            reset: 'Limpar filtros',
            empty: 'Nenhuma skill corresponde à busca.',
            emptyHint: 'Tente outra responsabilidade ou limpe os filtros.',
            sourceDescription:
                'Os nomes e as descrições originais dos pacotes estão em inglês, conforme o catálogo-fonte.',
            open: 'Ler o código-fonte do pacote',
            noScript: 'O catálogo completo está abaixo. Busca e filtros precisam de JavaScript.',
        },
        install: {
            title: 'Seu agente.',
            emphasis: 'Sua instalação.',
            description:
                'Skills portáteis, um plugin para o host ou a CLI do toolkit. Escolha o que precisa.',
            packages: 'Pacotes portáteis',
            packagesBody:
                'Instale as skills para o agente escolhido neste projeto. Hooks do host são uma integração separada.',
            packagesLink: 'Escopos e agentes suportados',
            plugin: 'Plugin do Codex',
            pluginBody: 'Skills, hook de sessão e MCP do catálogo. Requer Codex CLI e Node.js 24+.',
            pluginLink: 'Desktop, atualizações e remoção',
            toolkit: 'CLI do toolkit',
            toolkitBody: 'Execute comandos de catálogo e gestão de skills com Node.js 24+.',
            toolkitGit:
                'Prévia por código Git: requer Git e dependências de preparação. Não afirmamos disponibilidade no registro aqui.',
            toolkitRegistry:
                'Pacote publicado no registro; executar a CLI é separado de instalar as skills.',
            toolkitLink: 'Referência de comandos',
            copy: 'Copiar',
            copied: 'Copiado',
            copyFailure: 'Cópia indisponível. Selecione o comando e copie manualmente.',
            copyLabel: 'Copiar comando',
        },
        evidence: {
            title: 'Evidência antes da confiança.',
            items: [
                {
                    title: 'Núcleo portátil',
                    body: 'Markdown Agent Skills e recursos incluídos no pacote.',
                },
                {
                    title: 'Limites explícitos',
                    body: 'Verificações estruturais e pilotos de provedores cobrem coisas diferentes.',
                },
                {
                    title: 'Ainda experimental',
                    body: 'Sem promessa de compatibilidade universal ou qualidade de produção.',
                },
            ],
            link: 'Ler compatibilidade e evidências',
            providers:
                'Os pilotos de plugin do Codex e Claude exercitam caminhos nativos específicos. A evidência do Copilot CLI cobre descoberta MCP e chamadas diretas de plugin legado efêmero, sem turno de modelo nem instalação persistente. Ícones e hooks dependem do host.',
        },
        footer: {
            source: 'GitHub',
            docs: 'Documentação',
            license: 'Apache-2.0',
            privacy: 'Privacidade (em inglês)',
            terms: 'Termos (em inglês)',
            preview: 'Versão em revisão. Produção depende da aprovação do merge.',
        },
    },
    es: {
        title: 'I-9 Skills — Skills enfocadas, por diseño',
        description:
            'Crea, evalúa y evoluciona skills de agentes con paquetes enfocados, un núcleo portátil y evidencia explícita.',
        skip: 'Ir al contenido',
        navigation: 'Navegación principal',
        language: 'Elegir idioma',
        languageSuggestion: {
            message: 'Tu navegador prefiere español. ¿Quieres ver esta página en español?',
            action: 'Ver en español',
            dismiss: 'Ahora no',
        },
        nav: { workflow: 'Flujo', catalog: 'Catálogo', install: 'Instalar', docs: 'Docs' },
        hero: {
            title: 'Mejores skills.',
            emphasis: 'Por diseño.',
            description:
                'Crea, evalúa y evoluciona skills de agentes. Una responsabilidad. Un resultado revisable.',
            primary: 'Explorar el catálogo',
            secondary: 'Elegir cómo instalar',
            count: 'meta-skills enfocadas',
            license: 'Apache-2.0',
            portable: 'Núcleo portátil',
        },
        workflow: {
            title: 'Empieza donde lo necesites.',
            emphasis: 'Mejora con intención.',
            description: 'Conserva lo que funciona. Cambia una responsabilidad a la vez.',
            stages: [
                {
                    title: 'Crear',
                    body: 'Define la tarea. Investiga el dominio. Crea un paquete completo.',
                    skill: 'skill-authoring',
                },
                {
                    title: 'Verificar',
                    body: 'Evalúa comportamiento, seguridad y compatibilidad declarada.',
                    skill: 'skill-evaluator',
                },
                {
                    title: 'Mejorar',
                    body: 'Audita lo que existe. Conserva evidencia. Evoluciona el menor cambio útil.',
                    skill: 'skills-audit',
                },
                {
                    title: 'Distribuir',
                    body: 'Elige un paquete aprobado y una distribución deliberada.',
                    skill: 'skill-publication',
                },
            ],
        },
        catalog: {
            title: 'Encuentra la skill',
            emphasis: 'para tu tarea.',
            description: 'Paquetes enfocados para todo el ciclo de vida de una skill de agente.',
            source: 'Ver catálogo fuente',
            search: 'Buscar skills',
            placeholder: 'Nombre, responsabilidad o palabra clave',
            filters: 'Filtrar por responsabilidad',
            all: 'Todas',
            categories: {
                create: 'Crear',
                evaluate: 'Evaluar',
                manage: 'Gestionar',
                evolve: 'Evolucionar',
                distribute: 'Distribuir',
            },
            count: 'skills',
            singular: 'skill',
            reset: 'Borrar filtros',
            empty: 'Ninguna skill coincide con la búsqueda.',
            emptyHint: 'Prueba otra responsabilidad o borra los filtros.',
            sourceDescription:
                'Los nombres y las descripciones originales de los paquetes están en inglés, según el catálogo fuente.',
            open: 'Leer el código fuente del paquete',
            noScript:
                'El catálogo completo está debajo. La búsqueda y los filtros necesitan JavaScript.',
        },
        install: {
            title: 'Tu agente.',
            emphasis: 'Tu instalación.',
            description:
                'Skills portátiles, un plugin para el host o la CLI del toolkit. Elige lo que necesitas.',
            packages: 'Paquetes portátiles',
            packagesBody:
                'Instala skills para el agente elegido en este proyecto. Los hooks del host son una integración separada.',
            packagesLink: 'Ámbitos y agentes compatibles',
            plugin: 'Plugin de Codex',
            pluginBody:
                'Skills, hook de sesión y MCP del catálogo. Requiere Codex CLI y Node.js 24+.',
            pluginLink: 'Desktop, actualizaciones y eliminación',
            toolkit: 'CLI del toolkit',
            toolkitBody: 'Ejecuta comandos de catálogo y gestión de skills con Node.js 24+.',
            toolkitGit:
                'Vista previa desde código Git: requiere Git y dependencias de preparación. No afirmamos disponibilidad en el registro aquí.',
            toolkitRegistry:
                'Paquete publicado en el registro; ejecutar la CLI es distinto de instalar skills.',
            toolkitLink: 'Referencia de comandos',
            copy: 'Copiar',
            copied: 'Copiado',
            copyFailure: 'Copia no disponible. Selecciona el comando y cópialo manualmente.',
            copyLabel: 'Copiar comando',
        },
        evidence: {
            title: 'Evidencia antes de la confianza.',
            items: [
                {
                    title: 'Núcleo portátil',
                    body: 'Markdown Agent Skills y recursos incluidos en el paquete.',
                },
                {
                    title: 'Límites explícitos',
                    body: 'Las verificaciones estructurales y los pilotos de proveedores cubren cosas distintas.',
                },
                {
                    title: 'Aún experimental',
                    body: 'Sin promesa de compatibilidad universal o calidad de producción.',
                },
            ],
            link: 'Leer compatibilidad y evidencia',
            providers:
                'Los pilotos de plugins de Codex y Claude prueban rutas nativas específicas. La evidencia de Copilot CLI cubre descubrimiento MCP y llamadas directas de un plugin legado efímero, sin turno de modelo ni instalación persistente. Los iconos y hooks dependen del host.',
        },
        footer: {
            source: 'GitHub',
            docs: 'Documentación',
            license: 'Apache-2.0',
            privacy: 'Privacidad (en inglés)',
            terms: 'Términos (en inglés)',
            preview: 'Versión en revisión. Producción depende de la aprobación del merge.',
        },
    },
};
