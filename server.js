import express from "express";
import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";

// Carregar variáveis de ambiente
dotenv.config();

const app = express();
const PORT = 3011;

// Parse JSON bodies
app.use(express.json());

// Variáveis de ambiente para credenciais
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_SERVER_ID = process.env.DISCORD_SERVER_ID;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const DISCORD_STATUS_CATEGORY_ID = "1437137837471305789"; // Categoria para mostrar jogadores online

console.log("🔧 Configurações carregadas:");
console.log("   Token:", DISCORD_TOKEN ? "✅ Configurado" : "❌ Faltando");
console.log("   Server ID:", DISCORD_SERVER_ID ? "✅ Configurado" : "❌ Faltando");
console.log("   Channel ID:", DISCORD_CHANNEL_ID ? "✅ Configurado" : "❌ Faltando");

// Habilitar CORS para todas as origens
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// --- Discord Bot ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.login(DISCORD_TOKEN);

// Cache de membros
let membersCache = [];
let lastFetch = 0;
const CACHE_DURATION = 30000; // 30 segundos de cache

// Cache do status do servidor Minecraft
let lastOnlinePlayers = -1; // Para detectar mudanças
let lastCategoryName = ""; // Para detectar mudanças na categoria

// Sistema de autenticação pendente
// { token: { userId, userName, timestamp, verified, messageId, messageContent } }
let pendingAuth = {};

// Quando o bot estiver online
client.once("ready", async () => {
  console.log(`Bot logado como ${client.user.tag}`);
  
  // Fazer fetch inicial dos membros
  await updateMembersCache();
  
  // Atualizar cache a cada 30 segundos
  setInterval(updateMembersCache, CACHE_DURATION);
  
  // Atualizar status do servidor Minecraft no canal
  await updateServerStatusChannel();
  
  // Verificar status do servidor a cada 5 minutos (respeita rate limit do Discord)
  setInterval(updateServerStatusChannel, 5 * 60 * 1000);
});

// Listener para mensagens (resposta de confirmação)
client.on("messageCreate", async (message) => {
  // Ignorar mensagens de bots
  if (message.author.bot) return;
  
  console.log(`[MSG] Mensagem recebida de ${message.author.username}: "${message.content}"`);
  
  // Verificar se está no canal correto
  if (message.channel.id !== DISCORD_CHANNEL_ID) {
    console.log(`[MSG] Ignorando - canal errado (${message.channel.id} !== ${DISCORD_CHANNEL_ID})`);
    return;
  }
  
  const userMessage = message.content.toLowerCase().trim();
  
  // Verificar se é uma resposta "sim"
  if (userMessage === "sim") {
    console.log(`[MSG] Resposta "sim" detectada de ${message.author.username}`);
    
    // Caso 1: É um reply a uma mensagem do bot
    if (message.reference) {
      try {
        console.log(`[MSG] Buscando mensagem referenciada: ${message.reference.messageId}`);
        const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
        console.log(`[MSG] Mensagem encontrada! Autor: ${repliedMessage.author.tag}`);
        
        // Verificar se a mensagem original é do nosso bot
        if (repliedMessage.author.id === client.user.id) {
          console.log(`[MSG] É um reply à mensagem do bot`);
          console.log(`[MSG] ID da mensagem:`, repliedMessage.id);
          console.log(`[MSG] Conteúdo length:`, repliedMessage.content.length);
          console.log(`[MSG] Conteúdo completo da mensagem:`);
          console.log(JSON.stringify(repliedMessage.content));
          console.log(`[MSG] Embeds:`, repliedMessage.embeds.length);
          console.log(`[MSG] Components:`, repliedMessage.components.length);
          
          // Tentar encontrar o token primeiro no nosso cache
          let tokenFound = null;
          for (const [token, authData] of Object.entries(pendingAuth)) {
            if (authData.messageId === repliedMessage.id) {
              tokenFound = token;
              console.log(`[AUTH] Token encontrado no cache pelo messageId: ${token}`);
              break;
            }
          }
          
          // Se não encontrou no cache, tentar extrair da mensagem
          if (!tokenFound && repliedMessage.content) {
            const tokenMatch = repliedMessage.content.match(/\[([a-z0-9]+)\]/i);
            console.log(`[MSG] Resultado do match:`, tokenMatch);
            if (tokenMatch) {
              tokenFound = tokenMatch[1];
              console.log(`[AUTH] Token extraído do conteúdo: ${tokenFound}`);
            }
          }
          
          if (tokenFound) {
            // Verificar se o token existe e se quem respondeu é o usuário correto
            if (pendingAuth[tokenFound]) {
              console.log(`[AUTH] Token encontrado. User esperado: ${pendingAuth[tokenFound].userId}, User atual: ${message.author.id}`);
              
              if (pendingAuth[tokenFound].userId === message.author.id) {
                pendingAuth[tokenFound].verified = true;
                await message.reply("✅ Autenticação confirmada! Você pode acessar o site agora.");
                console.log(`✅ Autenticação confirmada para ${message.author.username} [${tokenFound}]`);
              } else {
                console.log(`❌ Usuário diferente tentou confirmar. Esperado: ${pendingAuth[tokenFound].userId}, Recebido: ${message.author.id}`);
              }
            } else {
              console.log(`❌ Token não encontrado ou expirado: ${tokenFound}`);
              console.log(`[DEBUG] Tokens pendentes:`, Object.keys(pendingAuth));
            }
          } else {
            console.log(`❌ Token não encontrado na mensagem original`);
            console.log(`[DEBUG] Tokens pendentes:`, Object.keys(pendingAuth));
          }
        }
      } catch (err) {
        console.error("❌ Erro ao processar reply:", err);
      }
    } 
    // Caso 2: Não é reply, procurar última mensagem do bot para este usuário
    else {
      console.log(`[MSG] Não é um reply, procurando última mensagem do bot para ${message.author.username}`);
      
      try {
        // Buscar mensagens recentes do canal
        const messages = await message.channel.messages.fetch({ limit: 50 });
        
        // Procurar a última mensagem do bot mencionando este usuário
        const botMessage = messages.find(msg => 
          msg.author.id === client.user.id && 
          msg.content.includes(`<@${message.author.id}>`)
        );
        
        if (botMessage) {
          console.log(`[MSG] Mensagem do bot encontrada para ${message.author.username}`);
          
          const tokenMatch = botMessage.content.match(/\[([a-f0-9]+)\]/);
          if (tokenMatch) {
            const token = tokenMatch[1];
            console.log(`[AUTH] Token extraído: ${token}`);
            
            if (pendingAuth[token] && pendingAuth[token].userId === message.author.id) {
              pendingAuth[token].verified = true;
              await message.reply("✅ Autenticação confirmada! Você pode acessar o site agora.");
              console.log(`✅ Autenticação confirmada para ${message.author.username} [${token}]`);
            } else if (!pendingAuth[token]) {
              console.log(`❌ Token expirado: ${token}`);
              await message.reply("❌ Esta solicitação de autenticação já expirou. Por favor, tente fazer login novamente.");
            }
          }
        } else {
          console.log(`❌ Nenhuma mensagem de autenticação recente encontrada para ${message.author.username}`);
        }
      } catch (err) {
        console.error("❌ Erro ao buscar mensagens:", err);
      }
    }
  }
});

// Função para atualizar o nome do canal com status do servidor
async function updateServerStatusChannel() {
  try {
    console.log("🎮 Verificando status do servidor Minecraft...");
    
    // Buscar status do servidor Minecraft via API (usando nome do container Docker)
    const response = await fetch("http://mcstatus-web:3010/api/status");
    const data = await response.json();
    
    if (data.error) {
      console.log("❌ Servidor Minecraft offline ou erro:", data.error);
      // Se o servidor estiver offline, mostrar 0
      if (lastOnlinePlayers !== 0) {
        // Atualizar categoria com emoji vermelho
        try {
          const category = await client.channels.fetch(DISCORD_STATUS_CATEGORY_ID);
          const categoryName = `🔴 Minecraft - 0/4 Online`;
          if (lastCategoryName !== categoryName) {
            await category.setName(categoryName);
            lastCategoryName = categoryName;
            console.log(`📝 Categoria atualizada: ${categoryName}`);
          }
        } catch (categoryErr) {
          console.error(`❌ Erro ao atualizar categoria (${DISCORD_STATUS_CATEGORY_ID}):`, categoryErr.message);
        }
        
        lastOnlinePlayers = 0;
      }
      return;
    }
    
    const onlinePlayers = data.players_online;
    const maxPlayers = data.players_max;
    
    console.log(`🎮 Jogadores online: ${onlinePlayers}/${maxPlayers}`);
    
    // Só atualiza se o número mudou (evita rate limit)
    if (onlinePlayers !== lastOnlinePlayers) {
      // Atualizar categoria com emoji verde ou vermelho
      try {
        const category = await client.channels.fetch(DISCORD_STATUS_CATEGORY_ID);
        const emoji = onlinePlayers > 0 ? "🟢" : "🔴";
        const categoryName = `${emoji} Minecraft - ${onlinePlayers}/4 Online`;
        
        if (lastCategoryName !== categoryName) {
          await category.setName(categoryName);
          lastCategoryName = categoryName;
          console.log(`📝 Categoria atualizada: ${categoryName}`);
        }
      } catch (categoryErr) {
        console.error(`❌ Erro ao atualizar categoria (${DISCORD_STATUS_CATEGORY_ID}):`, categoryErr.message);
      }
      
      lastOnlinePlayers = onlinePlayers;
    } else {
      console.log("ℹ️ Sem mudanças no número de jogadores");
    }
  } catch (err) {
    console.error("❌ Erro ao atualizar status do servidor:", err.message);
  }
}

// Função para atualizar o cache de membros
async function updateMembersCache() {
  try {
    console.log("Atualizando cache de membros...");
    const guild = await client.guilds.fetch(DISCORD_SERVER_ID);
    await guild.members.fetch(); // garante que todos são carregados

    membersCache = guild.members.cache.map(m => ({
      id: m.id,
      name: m.user.username,
      displayName: m.displayName,
      avatar: m.user.displayAvatarURL(),
      status: m.presence?.status || "offline" // online / idle / dnd / offline
    }));

    lastFetch = Date.now();
    console.log(`Cache atualizado: ${membersCache.length} membros`);
  } catch (err) {
    console.error("Erro ao atualizar cache:", err.message);
  }
}

// Rota da API para pegar membros (agora usa cache)
app.get("/members", async (req, res) => {
  try {
    // Se não tiver cache ainda, espera o bot ficar pronto
    if (membersCache.length === 0 && client.isReady()) {
      await updateMembersCache();
    }

    res.json({
      members: membersCache,
      cached: true,
      lastUpdate: lastFetch,
      cacheAge: Date.now() - lastFetch
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: true, message: err.message });
  }
});

// Rota de health check
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    botReady: client.isReady(),
    botUser: client.user ? client.user.tag : "not connected"
  });
});

// Rota para iniciar autenticação
app.post("/auth/request", async (req, res) => {
  try {
    const { userId, userName, userIp } = req.body;
    
    if (!userId || !userName) {
      return res.status(400).json({ error: "userId e userName são obrigatórios" });
    }
    
    // Gerar token único
    const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    // Enviar mensagem no canal do Discord PRIMEIRO
    const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
    const userIpDisplay = userIp || "IP desconhecido";
    const messageContent = `🔐 **Tentativa de Login**\n` +
      `Olá <@${userId}> (**${userName}**), vimos que tentou acessar o site http://10.150.135.158:3010\n` +
      `e está tentando logar. Se foi você, responda esta mensagem com **"Sim"** para confirmar.\n\n` +
      `⏱️ Esta solicitação expira em 5 minutos.\n` +
      `[${token}]`;
    
    const message = await channel.send(messageContent);
    
    // Salvar no sistema de autenticação pendente COM o messageId
    pendingAuth[token] = {
      userId,
      userName,
      timestamp: Date.now(),
      verified: false,
      messageId: message.id,
      messageContent: messageContent
    };
    
    console.log(`Autenticação solicitada para ${userName} [${token}]`);
    console.log(`Message ID: ${message.id}`);
    console.log(`Mensagem enviada:`, messageContent);
    
    // Limpar token após 5 minutos
    setTimeout(() => {
      if (pendingAuth[token] && !pendingAuth[token].verified) {
        delete pendingAuth[token];
        console.log(`Token expirado: ${token}`);
      }
    }, 5 * 60 * 1000);
    
    res.json({ success: true, token });
  } catch (err) {
    console.error("Erro ao solicitar autenticação:", err);
    res.status(500).json({ error: err.message });
  }
});

// Rota para verificar status de autenticação
app.get("/auth/check/:token", (req, res) => {
  const { token } = req.params;
  
  if (!pendingAuth[token]) {
    return res.json({ verified: false, expired: true });
  }
  
  const auth = pendingAuth[token];
  
  // Verificar se expirou (5 minutos)
  if (Date.now() - auth.timestamp > 5 * 60 * 1000) {
    delete pendingAuth[token];
    return res.json({ verified: false, expired: true });
  }
  
  res.json({ 
    verified: auth.verified,
    expired: false,
    userName: auth.userName
  });
});

app.listen(PORT, () => console.log("API Discord rodando na porta", PORT));
