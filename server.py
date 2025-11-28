import http.server
import socketserver
import os
import json
import uuid
import cgi
import sqlite3
import time
from pathlib import Path
from mcstatus import JavaServer
import psutil
from http.cookies import SimpleCookie

PORT = 3010
DIRECTORY = "html"
IMAGES_DIR = "html/imagens"
# Caminho do log do servidor Minecraft (dentro do container Docker)
MINECRAFT_LOG_PATH = "/minecraft-logs/latest.log"

# NOTA: Sistema de sessões agora usa SQLite (tabela user_sessions)
# Não é mais armazenado em memória

# Criar diretório de imagens se não existir
os.makedirs(IMAGES_DIR, exist_ok=True)

# Mudar para o diretório HTML
os.chdir(DIRECTORY)

# Agora o banco fica dentro de html/
DB_FILE = "images.db"

# Inicializar banco de dados
def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS image_captions (
            filename TEXT PRIMARY KEY,
            caption TEXT
        )
    ''')
    # Tabela para avisos dispensados pelos usuários
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS dismissed_notices (
            user_id TEXT,
            notice_id TEXT,
            dismissed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, notice_id)
        )
    ''')
    # Tabela para sessões de autenticação
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_sessions (
            session_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            user_name TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_access TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP NOT NULL
        )
    ''')
    conn.commit()
    conn.close()

init_db()

class MyHandler(http.server.SimpleHTTPRequestHandler):

    def check_auth(self):
        """Verifica se o usuário está autenticado via cookie e banco de dados"""
        cookie_header = self.headers.get('Cookie', '')
        print(f"[AUTH] Verificando autenticação... Cookie: {cookie_header}")
        
        cookie = SimpleCookie(cookie_header)
        if 'session_id' in cookie:
            session_id = cookie['session_id'].value
            print(f"[AUTH] Session ID encontrado: {session_id}")
            
            try:
                conn = sqlite3.connect(DB_FILE)
                cursor = conn.cursor()
                
                # Buscar sessão no banco de dados
                cursor.execute('''
                    SELECT user_id, user_name, expires_at 
                    FROM user_sessions 
                    WHERE session_id = ?
                ''', (session_id,))
                
                result = cursor.fetchone()
                
                if result:
                    user_id, user_name, expires_at = result
                    
                    # Verificar se a sessão expirou
                    expires_timestamp = time.mktime(time.strptime(expires_at, '%Y-%m-%d %H:%M:%S'))
                    
                    if time.time() < expires_timestamp:
                        # Atualizar last_access
                        cursor.execute('''
                            UPDATE user_sessions 
                            SET last_access = CURRENT_TIMESTAMP 
                            WHERE session_id = ?
                        ''', (session_id,))
                        conn.commit()
                        
                        print(f"[AUTH] ✅ Sessão válida para: {user_name}")
                        conn.close()
                        return True
                    else:
                        print(f"[AUTH] ❌ Sessão expirada")
                        # Remover sessão expirada
                        cursor.execute('DELETE FROM user_sessions WHERE session_id = ?', (session_id,))
                        conn.commit()
                else:
                    print(f"[AUTH] ❌ Session ID não encontrado no banco")
                
                conn.close()
            except Exception as e:
                print(f"[AUTH] ❌ Erro ao verificar sessão: {e}")
        else:
            print(f"[AUTH] ❌ Nenhum session_id no cookie")
        
        return False

    def do_GET(self):
        print(f"[GET] Requisição recebida: {self.path}")

        # --- NOVA ROTA /inicio ---
        if self.path == '/inicio' or self.path == '/inicio/':
            # 1. Verifica se está autenticado
            if not self.check_auth():
                print("[AUTH] Acesso negado a /inicio. Redirecionando para /")
                # 2. Se NÃO estiver autenticado, faz o redirect (302) para a raiz
                self.send_response(302)
                self.send_header('Location', '/')
                self.end_headers()
                return
            
            # 3. Se estiver autenticado, carrega o index.html
            self.handle_inicio()
            return
        # -------------------------

        if self.path == '/api/status':
            self.handle_status()
            return

        if self.path == '/api/system-metrics':
            self.handle_system_metrics()
            return

        if self.path == '/api/logs':
            self.handle_logs()
            return
        
        if self.path == '/api/check-auth':
            print("[GET] Chamando handle_check_auth")
            self.handle_check_auth()
            return
        
        if self.path == '/api/user-info':
            print("[GET] Chamando handle_user_info")
            self.handle_user_info()
            return
        
        if self.path == '/api/discord/members':
            print("[GET] Chamando handle_discord_members")
            self.handle_discord_members()
            return
        
        if self.path.startswith('/api/notices/dismissed/'):
            self.handle_get_dismissed_notices()
            return
        
        if self.path == '/api/top-players':
            self.handle_top_players()
            return
        
        if self.path.startswith('/api/player-stats/'):
            self.handle_player_stats()
            return

        if self.path == '/teste' or self.path == '/teste/':
            # Página de teste protegida
            if not self.check_auth():
                self.redirect_to_login()
                return
            self.handle_teste()
            return

        if self.path == '/login' or self.path == '/login/':
            # Login page - accessible to everyone
            # If already authenticated, redirect to home
            if self.check_auth():
                self.redirect_to_home()
                return
            self.handle_login_page()
            return

        if self.path == '/':
            # Serve the mine page as the new root (COM autenticação)
            if not self.check_auth():
                # Redirect to login page
                self.redirect_to_login()
                return
            self.handle_mine()
            return

        # Removed legacy /desativado route (index.html deprecated)

        if self.path == '/mine' or self.path == '/mine/':
            # Keep /mine working as before (also serves the mine.html page)
            self.handle_mine()
            return

        # If it's an API route that wasn't handled, return 404 JSON
        if self.path.startswith('/api/'):
            self.send_response(404)
            self.send_header("Content-type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            response = json.dumps({"error": "API endpoint not found"})
            self.wfile.write(response.encode("utf-8"))
            return
        
        # Only allow super().do_GET() for specific paths (static files, images, etc.)
        # This prevents unwanted directory listings or file downloads
        allowed_paths = ['/imagens/', '/downloads/', '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf']
        if any(allowed in self.path for allowed in allowed_paths):
            return super().do_GET()
        
        # If path not handled, serve mine.html as default
        self.handle_mine()
        return
    
    def do_POST(self):
        
        if self.path == '/api/create-session':
            self.handle_create_session()
            return
        
        if self.path == '/api/discord/request-auth':
            self.handle_request_auth()
            return
        
        if self.path == '/api/discord/verify-auth':
            self.handle_verify_auth()
            return
        
        if self.path == '/api/logout':
            self.handle_logout()
            return
        
        if self.path == '/api/notices/dismiss':
            self.handle_dismiss_notice()
            return
        
        self.send_error(404)
    
    def do_DELETE(self):
        self.send_error(404)
    
    def do_OPTIONS(self):
        """Handle CORS preflight requests"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def handle_system_metrics(self):
        try:
            # Obter uso de CPU e RAM
            cpu_percent = psutil.cpu_percent(interval=0.1)
            memory = psutil.virtual_memory()
            
            data = {
                "cpu_percent": round(cpu_percent, 1),
                "ram_percent": round(memory.percent, 1),
                "ram_used_gb": round(memory.used / (1024**3), 2),
                "ram_total_gb": round(memory.total / (1024**3), 2)
            }
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(data).encode())
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            error_data = {"error": str(e)}
            self.wfile.write(json.dumps(error_data).encode())

    def handle_status(self):
        try:
            server = JavaServer("10.150.135.158", 25565)
            status = server.status()

            # Extrair nomes dos jogadores se disponível
            players_list = []
            if status.players.sample:
                players_list = [player.name for player in status.players.sample]

            data = {
                "version": status.version.name,
                "protocol": status.version.protocol,
                "motd": str(status.description),
                "players_online": status.players.online,
                "players_max": status.players.max,
                "ping": status.latency,
                "players_list": players_list
            }

        except Exception as e:
            data = {"error": str(e)}

        data_json = json.dumps(data)

        self.send_response(200)
        self.send_header("Content-type", "application/json")
        self.end_headers()
        self.wfile.write(data_json.encode("utf-8"))

    def handle_top_players(self):
        """Busca os top players dos arquivos de stats do Minecraft"""
        try:
            from datetime import datetime, timedelta
            import os
            
            # Mapear jogadores para UUIDs
            player_uuids = {
                'abcdan': 'c5839188-0e7d-4c3b-bcf0-0a61cf92c25e',
                'AllaNaroK': '9e219595-539e-4d84-85bf-42000a35d506',
                'HermeticPrince': 'c1bc4cb2-ab4e-402f-9da1-920de3163510',
                'BITalucard': '05b846ad-f1ad-40a0-bd0f-252073db78ca'
            }
            
            # Buscar jogadores online agora
            try:
                server = JavaServer("10.150.135.158", 25565)
                status = server.status()
                online_players = []
                if status.players.sample:
                    online_players = [player.name for player in status.players.sample]
            except:
                online_players = []
            
            players = []
            
            for name, uuid in player_uuids.items():
                stats_path = f"/minecraft-stats/{uuid}.json"
                
                try:
                    # Ler arquivo de stats
                    with open(stats_path, 'r') as f:
                        stats_data = json.load(f)
                    
                    stats = stats_data.get('stats', {})
                    custom = stats.get('minecraft:custom', {})
                    
                    # Tempo jogado em ticks (20 ticks = 1 segundo)
                    play_time_ticks = custom.get('minecraft:play_time', 0)
                    total_seconds = play_time_ticks // 20
                    hours = total_seconds // 3600
                    minutes = (total_seconds % 3600) // 60
                    
                    # Verificar última modificação do arquivo para "last seen"
                    file_mtime = os.path.getmtime(stats_path)
                    last_seen_dt = datetime.fromtimestamp(file_mtime)
                    now = datetime.now()
                    time_diff = now - last_seen_dt
                    
                    # Verificar se está online
                    is_online = name in online_players
                    
                    if is_online:
                        last_seen_str = "Agora"
                    elif time_diff < timedelta(hours=1):
                        mins = int(time_diff.total_seconds() / 60)
                        last_seen_str = f"Há {mins} min"
                    elif time_diff < timedelta(days=1):
                        hrs = int(time_diff.total_seconds() / 3600)
                        last_seen_str = f"Há {hrs}h"
                    elif time_diff < timedelta(days=2):
                        last_seen_str = "Ontem"
                    else:
                        last_seen_str = last_seen_dt.strftime("%d/%m/%Y")
                    
                    # Calcular barra de progresso (baseado no total de horas, max 500h = 100%)
                    progress = min(100, (hours / 500) * 100)
                    
                    players.append({
                        "name": name,
                        "playtime": f"{hours}h {minutes}m",
                        "playtime_seconds": total_seconds,
                        "last_seen": last_seen_str,
                        "is_online": is_online,
                        "progress": round(progress, 1)
                    })
                    
                except FileNotFoundError:
                    # Jogador sem arquivo de stats ainda
                    players.append({
                        "name": name,
                        "playtime": "0h 0m",
                        "playtime_seconds": 0,
                        "last_seen": "Nunca",
                        "is_online": name in online_players,
                        "progress": 0
                    })
                except Exception as e:
                    print(f"Erro ao ler stats de {name}: {e}")
            
            # Ordenar por tempo jogado (maior primeiro)
            players.sort(key=lambda x: x['playtime_seconds'], reverse=True)
            
            # Adicionar rank
            for idx, player in enumerate(players, 1):
                player['rank'] = idx
            
            # Contar quantos estão online
            online_count = sum(1 for p in players if p["is_online"])
            
            response_data = {
                "success": True,
                "players": players,
                "online_count": online_count,
                "total_players": len(players)
            }
            
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(response_data).encode("utf-8"))
            
        except Exception as e:
            print(f"Erro ao buscar top players: {e}")
            import traceback
            traceback.print_exc()
            
            response_data = {
                "success": False,
                "error": str(e),
                "players": [],
                "online_count": 0,
                "total_players": 0
            }
            
            self.send_response(500)
            self.send_header("Content-type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(response_data).encode("utf-8"))

    def handle_player_stats(self):
        """Busca estatísticas detalhadas de um jogador específico"""
        try:
            # Extrair nome do jogador da URL
            player_name = self.path.split('/api/player-stats/')[-1]
            player_name = player_name.strip('/')
            
            # Mapear nomes para UUIDs
            player_uuids = {
                'abcdan': 'c5839188-0e7d-4c3b-bcf0-0a61cf92c25e',
                'AllaNaroK': '9e219595-539e-4d84-85bf-42000a35d506',
                'HermeticPrince': 'c1bc4cb2-ab4e-402f-9da1-920de3163510',
                'BITalucard': '05b846ad-f1ad-40a0-bd0f-252073db78ca'
            }
            
            if player_name not in player_uuids:
                self.send_response(404)
                self.send_header("Content-type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": "Player not found"}).encode("utf-8"))
                return
            
            uuid = player_uuids[player_name]
            stats_path = f"/minecraft-stats/{uuid}.json"
            adv_path = f"/minecraft-advancements/{uuid}.json"
            
            # Carregar estatísticas
            with open(stats_path, 'r') as f:
                stats_data = json.load(f)
            
            stats = stats_data.get('stats', {})
            custom = stats.get('minecraft:custom', {})
            killed = stats.get('minecraft:killed', {})
            killed_by = stats.get('minecraft:killed_by', {})
            mined = stats.get('minecraft:mined', {})
            crafted = stats.get('minecraft:crafted', {})
            picked_up = stats.get('minecraft:picked_up', {})
            
            # Calcular estatísticas principais
            play_time_ticks = custom.get('minecraft:play_time', 0)
            play_time_hours = play_time_ticks // 20 // 3600
            play_time_minutes = (play_time_ticks // 20 // 60) % 60
            
            walk_cm = custom.get('minecraft:walk_one_cm', 0)
            sprint_cm = custom.get('minecraft:sprint_one_cm', 0)
            swim_cm = custom.get('minecraft:swim_one_cm', 0)
            fly_cm = custom.get('minecraft:aviate_one_cm', 0)
            
            # Top 5 mobs killed
            sorted_killed = sorted(killed.items(), key=lambda x: x[1], reverse=True)[:5]
            top_mobs_killed = [{"mob": k.split(':')[-1].replace('_', ' ').title(), "count": v} for k, v in sorted_killed]
            
            # Top 5 items mined
            sorted_mined = sorted(mined.items(), key=lambda x: x[1], reverse=True)[:5]
            top_mined = [{"item": k.split(':')[-1].replace('_', ' ').title(), "count": v} for k, v in sorted_mined]
            
            # Killed by
            killed_by_list = [{"mob": k.split(':')[-1].replace('_', ' ').title(), "count": v} for k, v in killed_by.items()]
            
            # Total de itens coletados
            total_picked_up = sum(picked_up.values())
            
            # Total de blocos minerados
            total_mined = sum(mined.values())
            
            # Total de itens craftados
            total_crafted = sum(crafted.values())
            
            # Carregar advancements
            completed_advancements = 0
            try:
                with open(adv_path, 'r') as f:
                    adv_data = json.load(f)
                completed_advancements = len([k for k, v in adv_data.items() if isinstance(v, dict) and v.get('done', False)])
            except:
                pass
            
            response_data = {
                "success": True,
                "player": player_name,
                "stats": {
                    "playtime": f"{play_time_hours}h {play_time_minutes}m",
                    "playtime_minutes": play_time_ticks // 20 // 60,
                    "deaths": custom.get('minecraft:deaths', 0),
                    "mob_kills": custom.get('minecraft:mob_kills', 0),
                    "player_kills": custom.get('minecraft:player_kills', 0),
                    "damage_dealt": custom.get('minecraft:damage_dealt', 0),
                    "damage_taken": custom.get('minecraft:damage_taken', 0),
                    "jumps": custom.get('minecraft:jump', 0),
                    "distance_walked": round(walk_cm / 100000, 2),  # km
                    "distance_sprinted": round(sprint_cm / 100000, 2),  # km
                    "distance_swam": round(swim_cm / 100, 2),  # metros
                    "distance_flown": round(fly_cm / 100000, 2),  # km
                    "blocks_mined": total_mined,
                    "items_collected": total_picked_up,
                    "items_crafted": total_crafted,
                    "advancements_completed": completed_advancements,
                    "top_mobs_killed": top_mobs_killed,
                    "top_mined": top_mined,
                    "killed_by": killed_by_list
                }
            }
            
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(response_data).encode("utf-8"))
            
        except FileNotFoundError:
            self.send_response(404)
            self.send_header("Content-type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"success": False, "error": "Stats file not found"}).encode("utf-8"))
            
        except Exception as e:
            print(f"Erro ao buscar stats do player: {e}")
            import traceback
            traceback.print_exc()
            
            self.send_response(500)
            self.send_header("Content-type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode("utf-8"))

    # Legacy index page removed; use `mine.html` as the primary page.

    def handle_mine(self):
        with open("mine.html", "r", encoding="utf-8") as f:
            html = f.read()

        self.send_response(200)
        self.send_header("Content-type", "text/html")
        self.end_headers()
        self.wfile.write(html.encode("utf-8"))
    
    def handle_inicio(self):
        try:
            # Certifique-se que index.html está na pasta html/
            with open("index.html", "r", encoding="utf-8") as f:
                html = f.read()

            self.send_response(200)
            self.send_header("Content-type", "text/html")
            self.end_headers()
            self.wfile.write(html.encode("utf-8"))
        except FileNotFoundError:
            self.send_error(404, "Arquivo index.html nao encontrado na pasta html/")
    
    def handle_login_page(self):
        with open("login.html", "r", encoding="utf-8") as f:
            html = f.read()

        self.send_response(200)
        self.send_header("Content-type", "text/html")
        self.end_headers()
        self.wfile.write(html.encode("utf-8"))

    def redirect_to_login(self):
        """Redirect user to login page"""
        self.send_response(302)
        self.send_header("Location", "/login")
        self.end_headers()

    def redirect_to_home(self):
        """Redirect user to home page"""
        self.send_response(302)
        self.send_header("Location", "/")
        self.end_headers()
    
    def handle_teste(self):
        with open("teste.html", "r", encoding="utf-8") as f:
            html = f.read()

        self.send_response(200)
        self.send_header("Content-type", "text/html")
        self.end_headers()
        self.wfile.write(html.encode("utf-8"))
    
    def handle_check_auth(self):
        is_authenticated = self.check_auth()
        
        response = json.dumps({"authenticated": is_authenticated})
        self.send_response(200)
        self.send_header("Content-type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(response.encode("utf-8"))
    
    def handle_user_info(self):
        """Retorna informações do usuário logado"""
        try:
            cookie_header = self.headers.get('Cookie', '')
            cookie = SimpleCookie(cookie_header)
            
            if 'session_id' in cookie:
                session_id = cookie['session_id'].value
                
                # Buscar sessão no banco de dados
                conn = sqlite3.connect(DB_FILE)
                cursor = conn.cursor()
                
                cursor.execute('''
                    SELECT user_id, user_name, expires_at 
                    FROM user_sessions 
                    WHERE session_id = ?
                ''', (session_id,))
                
                result = cursor.fetchone()
                conn.close()
                
                if result:
                    user_id, user_name, expires_at = result
                    
                    # Verificar se sessão não expirou
                    expires_timestamp = time.mktime(time.strptime(expires_at, '%Y-%m-%d %H:%M:%S'))
                    if time.time() < expires_timestamp:
                        # Buscar avatar do Discord
                        try:
                            import urllib.request
                            req = urllib.request.Request('http://discord-bot:3011/members')
                            with urllib.request.urlopen(req, timeout=5) as response:
                                members_data = json.loads(response.read().decode('utf-8'))
                                
                            avatar_url = None
                            if 'members' in members_data:
                                for member in members_data['members']:
                                    if member['id'] == user_id:
                                        avatar_url = member.get('avatar')
                                        break
                            
                            response_data = {
                                "authenticated": True,
                                "userId": user_id,
                                "userName": user_name,
                                "avatar": avatar_url
                            }
                        except:
                            response_data = {
                                "authenticated": True,
                                "userId": user_id,
                                "userName": user_name,
                                "avatar": None
                            }
                        
                        self.send_response(200)
                        self.send_header("Content-type", "application/json")
                        self.send_header("Access-Control-Allow-Origin", "*")
                        self.end_headers()
                        self.wfile.write(json.dumps(response_data).encode("utf-8"))
                        return
            
            # Não autenticado
            response = json.dumps({"authenticated": False})
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(response.encode("utf-8"))
            
        except Exception as e:
            print(f"[ERROR] Erro ao buscar informações do usuário: {e}")
            response = json.dumps({"authenticated": False, "error": str(e)})
            self.send_response(500)
            self.send_header("Content-type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(response.encode("utf-8"))
    
    def handle_create_session(self):
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            token = data.get('token')
            userId = data.get('userId')
            userName = data.get('userName')
            
            print(f"[SESSION] Criando sessão para {userName} (ID: {userId})")
            
            if not token or not userId or not userName:
                raise ValueError("Dados incompletos")
            
            # Criar sessão no banco de dados
            session_id = str(uuid.uuid4())
            
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            
            # Calcular data de expiração (7 dias a partir de agora)
            expires_at = time.strftime('%Y-%m-%d %H:%M:%S', 
                                      time.localtime(time.time() + (7 * 24 * 60 * 60)))
            
            cursor.execute('''
                INSERT INTO user_sessions (session_id, user_id, user_name, expires_at)
                VALUES (?, ?, ?, ?)
            ''', (session_id, userId, userName, expires_at))
            
            conn.commit()
            conn.close()
            
            response = json.dumps({"success": True, "session_id": session_id})
            
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            # Definir cookie (7 dias = 604800 segundos)
            self.send_header("Set-Cookie", f"session_id={session_id}; Path=/; Max-Age=604800; SameSite=Lax")
            self.end_headers()
            self.wfile.write(response.encode("utf-8"))
            
            print(f"[SESSION] ✅ Sessão criada no banco: {session_id}")
            print(f"[SESSION] Expira em: {expires_at}")
            
        except Exception as e:
            print(f"[SESSION] ❌ Erro ao criar sessão: {e}")
            response = json.dumps({"success": False, "error": str(e)})
            self.send_response(400)
            self.send_header("Content-type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(response.encode("utf-8"))

    def handle_download(self):
        try:
            # path comes as /downloads/filename.zip
            filename = self.path[1:]

            # segurança básica
            if not filename or '..' in filename or filename.startswith('/'):
                raise ValueError("Nome de arquivo inválido")

            file_path = Path(filename)

            if not file_path.exists() or not file_path.is_file():
                self.send_error(404)
                return

            ctype, _ = mimetypes.guess_type(str(file_path))
            if not ctype:
                ctype = 'application/octet-stream'

            with open(file_path, 'rb') as f:
                data = f.read()

            self.send_response(200)
            self.send_header('Content-Type', ctype)
            self.send_header('Content-Disposition', f'attachment; filename="{file_path.name}"')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        except Exception as e:
            print(f"Erro no download: {e}")
            self.send_response(400)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
    
    
    def handle_logs(self):
        try:
            # Debug: mostrar o caminho que está sendo procurado
            print(f"[DEBUG] Procurando log em: {MINECRAFT_LOG_PATH}")
            print(f"[DEBUG] Caminho existe? {os.path.exists(MINECRAFT_LOG_PATH)}")
            print(f"[DEBUG] Diretório atual: {os.getcwd()}")
            print(f"[DEBUG] Usuario atual: {os.getuid() if hasattr(os, 'getuid') else 'N/A'}")
            
            # Tentar verificar permissões
            if os.path.exists(MINECRAFT_LOG_PATH):
                try:
                    import stat
                    file_stat = os.stat(MINECRAFT_LOG_PATH)
                    print(f"[DEBUG] Permissões do arquivo: {oct(file_stat.st_mode)}")
                    print(f"[DEBUG] Dono do arquivo: UID={file_stat.st_uid}, GID={file_stat.st_gid}")
                    print(f"[DEBUG] Arquivo legível? {os.access(MINECRAFT_LOG_PATH, os.R_OK)}")
                except Exception as perm_error:
                    print(f"[DEBUG] Erro ao verificar permissões: {perm_error}")
            
            # Ler o arquivo de log do Minecraft
            if not os.path.exists(MINECRAFT_LOG_PATH):
                error_msg = f"Arquivo de log não encontrado em: {MINECRAFT_LOG_PATH}"
                print(f"[ERROR] {error_msg}")
                raise ValueError(error_msg)
            
            with open(MINECRAFT_LOG_PATH, 'r', encoding='utf-8', errors='ignore') as f:
                log_lines = f.readlines()
            
            # Pegar as últimas 500 linhas para não sobrecarregar
            log_lines = log_lines[-500:]
            
            response = json.dumps({
                "success": True,
                "logs": log_lines,
                "total_lines": len(log_lines)
            })
            
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(response.encode("utf-8"))
            
        except Exception as e:
            print(f"[ERROR] Erro ao ler logs: {e}")
            response = json.dumps({"success": False, "error": str(e)})
            self.send_response(500)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(response.encode("utf-8"))
    
    def handle_discord_members(self):
        """Proxy para buscar membros do Discord do serviço discord-bot"""
        try:
            import urllib.request
            
            # Fazer request para o serviço discord-bot
            req = urllib.request.Request('http://discord-bot:3011/members')
            with urllib.request.urlopen(req, timeout=5) as response:
                data = response.read()
            
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(data)
            
        except Exception as e:
            print(f"[ERROR] Erro ao buscar membros do Discord: {e}")
            response = json.dumps({"error": str(e), "members": []})
            self.send_response(500)
            self.send_header("Content-type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(response.encode("utf-8"))
    
    def handle_request_auth(self):
        """Solicita autenticação via Discord"""
        try:
            import urllib.request
            
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            data = json.loads(post_data.decode('utf-8'))
            print(f"[REQUEST] Solicitando autenticação para: {data.get('userName')} (ID: {data.get('userId')})")
            
            # Encaminhar request para o serviço discord-bot
            req = urllib.request.Request(
                'http://discord-bot:3011/auth/request',
                data=post_data,
                headers={'Content-Type': 'application/json'}
            )
            
            with urllib.request.urlopen(req, timeout=5) as response:
                response_data = response.read()
            
            result = json.loads(response_data.decode('utf-8'))
            print(f"[REQUEST] Resposta do Discord Bot: {result}")
            
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(response_data)
            
        except Exception as e:
            print(f"[ERROR] Erro ao solicitar autenticação: {e}")
            import traceback
            traceback.print_exc()
            response = json.dumps({"error": str(e), "success": False})
            self.send_response(500)
            self.send_header("Content-type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(response.encode("utf-8"))
    
    def handle_verify_auth(self):
        """Verifica se autenticação foi confirmada no Discord"""
        try:
            import urllib.request
            
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            token = data.get('token')
            userId = data.get('userId')
            userName = data.get('userName')
            
            print(f"[VERIFY] Verificando autenticação para token: {token}, user: {userName}")
            
            # Verificar status no serviço discord-bot
            req = urllib.request.Request(f'http://discord-bot:3011/auth/check/{token}')
            
            with urllib.request.urlopen(req, timeout=5) as response:
                auth_data = json.loads(response.read().decode('utf-8'))
            
            print(f"[VERIFY] Resposta do Discord Bot: {auth_data}")
            
            if auth_data.get('verified'):
                # Criar sessão no banco de dados
                if not userId or not userName:
                    print(f"[VERIFY] ❌ userId ou userName não fornecidos!")
                    raise ValueError("userId e userName são obrigatórios")
                
                session_id = str(uuid.uuid4())
                
                conn = sqlite3.connect(DB_FILE)
                cursor = conn.cursor()
                
                # Calcular data de expiração (7 dias)
                expires_at = time.strftime('%Y-%m-%d %H:%M:%S', 
                                          time.localtime(time.time() + (7 * 24 * 60 * 60)))
                
                cursor.execute('''
                    INSERT INTO user_sessions (session_id, user_id, user_name, expires_at)
                    VALUES (?, ?, ?, ?)
                ''', (session_id, userId, userName, expires_at))
                
                conn.commit()
                conn.close()
                
                response_data = json.dumps({
                    "verified": True,
                    "session_id": session_id
                })
                
                self.send_response(200)
                self.send_header("Content-type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Set-Cookie", f"session_id={session_id}; Path=/; Max-Age=604800; SameSite=Lax")
                self.end_headers()
                self.wfile.write(response_data.encode("utf-8"))
                
                print(f"[AUTH] ✅ Usuário {userName} autenticado com sucesso! Session: {session_id}")
            else:
                print(f"[VERIFY] ⏳ Ainda não verificado ou expirado")
                response_data = json.dumps(auth_data)
                self.send_response(200)
                self.send_header("Content-type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(response_data.encode("utf-8"))
            
        except Exception as e:
            print(f"[ERROR] Erro ao verificar autenticação: {e}")
            import traceback
            traceback.print_exc()
            response = json.dumps({"verified": False, "error": str(e)})
            self.send_response(500)
            self.send_header("Content-type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(response.encode("utf-8"))
    
    def handle_logout(self):
        """Remove a sessão do usuário do banco de dados"""
        try:
            cookie_header = self.headers.get('Cookie', '')
            cookie = SimpleCookie(cookie_header)
            
            if 'session_id' in cookie:
                session_id = cookie['session_id'].value
                
                # Remover sessão do banco de dados
                conn = sqlite3.connect(DB_FILE)
                cursor = conn.cursor()
                cursor.execute('DELETE FROM user_sessions WHERE session_id = ?', (session_id,))
                conn.commit()
                conn.close()
                
                print(f"[LOGOUT] Sessão removida do banco: {session_id}")
            
            response = json.dumps({"success": True})
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            # Remover cookie
            self.send_header("Set-Cookie", "session_id=; Path=/; Max-Age=0; SameSite=Lax")
            self.end_headers()
            self.wfile.write(response.encode("utf-8"))
            
        except Exception as e:
            print(f"[ERROR] Erro ao fazer logout: {e}")
            response = json.dumps({"success": False, "error": str(e)})
            self.send_response(500)
            self.send_header("Content-type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(response.encode("utf-8"))
    
    def handle_get_dismissed_notices(self):
        """Retorna os avisos dispensados por um usuário"""
        try:
            # Extrair userId da URL: /api/notices/dismissed/{userId}
            user_id = self.path.split('/')[-1]
            
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            cursor.execute('SELECT notice_id FROM dismissed_notices WHERE user_id = ?', (user_id,))
            rows = cursor.fetchall()
            conn.close()
            
            dismissed = [row[0] for row in rows]
            
            response = json.dumps({"success": True, "dismissed": dismissed})
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(response.encode("utf-8"))
            
        except Exception as e:
            print(f"[ERROR] Erro ao buscar avisos dispensados: {e}")
            response = json.dumps({"success": False, "error": str(e)})
            self.send_response(500)
            self.send_header("Content-type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(response.encode("utf-8"))
    
    def handle_dismiss_notice(self):
        """Marca um aviso como dispensado permanentemente para o usuário"""
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            user_id = data.get('userId')
            notice_id = data.get('noticeId')
            
            if not user_id or not notice_id:
                raise ValueError("userId e noticeId são obrigatórios")
            
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            cursor.execute('''
                INSERT OR REPLACE INTO dismissed_notices (user_id, notice_id)
                VALUES (?, ?)
            ''', (user_id, notice_id))
            conn.commit()
            conn.close()
            
            print(f"[NOTICE] Aviso {notice_id} dispensado pelo usuário {user_id}")
            
            response = json.dumps({"success": True})
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(response.encode("utf-8"))
            
        except Exception as e:
            print(f"[ERROR] Erro ao dispensar aviso: {e}")
            response = json.dumps({"success": False, "error": str(e)})
            self.send_response(500)
            self.send_header("Content-type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(response.encode("utf-8"))


with socketserver.TCPServer(("", PORT), MyHandler) as httpd:
    print(f"Servindo na porta {PORT}...")
    httpd.serve_forever()

