// CONFIGURAÇÃO DO SUPABASE (Substitua pelos seus dados)
const SUPABASE_URL = 'https://rgsnmxspyywwouhcdwkj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_nHPsCV3y79FgexEMAeANWQ_P6jWRDd1I';
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

async function carregarCardapio() {
    // 1. Pega o nome do cliente pela URL (ex: site.com/?u=pizzaria_do_ze)
    const params = new URLSearchParams(window.location.search);
    const clienteSlug = params.get('u');

    if (!clienteSlug) {
        document.body.innerHTML = "<h1>Erro: Cliente não identificado.</h1>";
        return;
    }

    document.getElementById('nome-loja').innerText = clienteSlug.replace('_', ' ').toUpperCase();

    // 2. Busca no banco de dados
    // Filtra pela coluna 'slug' (você deve ter essa coluna na tabela Cardapio)
    const { data: produtos, error } = await supabase
        .from('Cardapio')
        .select('*')
        .eq('slug', clienteSlug);

    if (error) {
        console.error('Erro ao buscar dados:', error);
        return;
    }

    // 3. Renderiza os produtos na tela
    const container = document.getElementById('cardapio');
    container.innerHTML = ''; // Limpa o loader

    produtos.forEach(item => {
        const card = `
            <div class="produto-card">
                <div class="produto-info">
                    <h3>${item.nome}</h3>
                    <p>${item.descricao || ''}</p>
                </div>
                <div class="preco">R$ ${item.preco.toFixed(2)}</div>
            </div>
        `;
        container.innerHTML += card;
    });
}

carregarCardapio();