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

# Sistema de sessões simples
# { session_id: { userId, userName, timestamp } }
sessions = {}

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
    conn.commit()
    conn.close()

init_db()

class MyHandler(http.server.SimpleHTTPRequestHandler):

    def check_auth(self):
        """Verifica se o usuário está autenticado via cookie"""
        cookie_header = self.headers.get('Cookie', '')
        print(f"[AUTH] Verificando autenticação... Cookie: {cookie_header}")
        
        cookie = SimpleCookie(cookie_header)
        if 'session_id' in cookie:
            session_id = cookie['session_id'].value
            print(f"[AUTH] Session ID encontrado: {session_id}")
            
            if session_id in sessions:
                # Verificar se sessão não expirou (24 horas)
                if time.time() - sessions[session_id]['timestamp'] < 24 * 60 * 60:
                    print(f"[AUTH] ✅ Sessão válida para: {sessions[session_id]['userName']}")
                    return True
                else:
                    print(f"[AUTH] ❌ Sessão expirada")
                    del sessions[session_id]
            else:
                print(f"[AUTH] ❌ Session ID não encontrado no servidor")
        else:
            print(f"[AUTH] ❌ Nenhum session_id no cookie")
        
        return False

    def do_GET(self):
        print(f"[GET] Requisição recebida: {self.path}")

        if self.path == '/api/status':
            self.handle_status()
            return

        if self.path == '/api/system-metrics':
            self.handle_system_metrics()
            return

        if self.path == '/api/images':
            self.handle_images_list()
            return
        
        if self.path.startswith('/api/caption/'):
            self.handle_get_caption()
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

        if self.path == '/teste' or self.path == '/teste/':
            # Página de teste protegida
            if not self.check_auth():
                self.handle_login_page()
                return
            self.handle_teste()
            return

        if self.path == '/':
            # Serve the mine page as the new root (COM autenticação)
            if not self.check_auth():
                # Se não autenticado, serve mine.html que mostrará o modal
                self.handle_mine()
                return
            self.handle_mine()
            return

        # Keep /desativado as a route that serves the old index.html
        if self.path == '/desativado' or self.path == '/desativado/':
            self.handle_index()
            return

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
        if self.path == '/api/upload':
            self.handle_upload()
            return
        
        if self.path.startswith('/api/caption/'):
            self.handle_update_caption()
            return
        
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
        
        self.send_error(404)
    
    def do_DELETE(self):
        if self.path.startswith('/api/images/'):
            self.handle_delete()
            return
        
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

    def handle_index(self):
        with open("index.html", "r", encoding="utf-8") as f:
            html = f.read()

        self.send_response(200)
        self.send_header("Content-type", "text/html")
        self.end_headers()
        self.wfile.write(html.encode("utf-8"))

    def handle_mine(self):
        with open("mine.html", "r", encoding="utf-8") as f:
            html = f.read()

        self.send_response(200)
        self.send_header("Content-type", "text/html")
        self.end_headers()
        self.wfile.write(html.encode("utf-8"))
    
    def handle_login_page(self):
        with open("login.html", "r", encoding="utf-8") as f:
            html = f.read()

        self.send_response(200)
        self.send_header("Content-type", "text/html")
        self.end_headers()
        self.wfile.write(html.encode("utf-8"))
    
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
                
                if session_id in sessions:
                    session = sessions[session_id]
                    # Verificar se sessão não expirou (24 horas)
                    if time.time() - session['timestamp'] < 24 * 60 * 60:
                        userId = session['userId']
                        userName = session['userName']
                        
                        # Buscar avatar do Discord
                        try:
                            import urllib.request
                            req = urllib.request.Request('http://discord-bot:3011/members')
                            with urllib.request.urlopen(req, timeout=5) as response:
                                members_data = json.loads(response.read().decode('utf-8'))
                                
                            avatar_url = None
                            if 'members' in members_data:
                                for member in members_data['members']:
                                    if member['id'] == userId:
                                        avatar_url = member.get('avatar')
                                        break
                            
                            response_data = {
                                "authenticated": True,
                                "userId": userId,
                                "userName": userName,
                                "avatar": avatar_url
                            }
                        except:
                            response_data = {
                                "authenticated": True,
                                "userId": userId,
                                "userName": userName,
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
            
            # Criar sessão
            session_id = str(uuid.uuid4())
            sessions[session_id] = {
                'userId': userId,
                'userName': userName,
                'timestamp': time.time()
            }
            
            response = json.dumps({"success": True, "session_id": session_id})
            
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            # Definir cookie (SameSite=None para funcionar cross-origin)
            self.send_header("Set-Cookie", f"session_id={session_id}; Path=/; Max-Age=86400; SameSite=Lax")
            self.end_headers()
            self.wfile.write(response.encode("utf-8"))
            
            print(f"[SESSION] ✅ Sessão criada: {session_id}")
            print(f"[SESSION] Total de sessões ativas: {len(sessions)}")
            
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
    
    def handle_images_list(self):
        try:
            images = []
            images_path = Path("imagens")
            
            if images_path.exists():
                image_files = [f.name for f in images_path.iterdir() 
                         if f.is_file() and f.suffix.lower() in ['.jpg', '.jpeg', '.png', '.gif', '.webp']]
                
                # Buscar legendas do banco de dados
                conn = sqlite3.connect(DB_FILE)
                cursor = conn.cursor()
                
                for filename in image_files:
                    cursor.execute('SELECT caption FROM image_captions WHERE filename = ?', (filename,))
                    result = cursor.fetchone()
                    caption = result[0] if result else ""
                    images.append({"filename": filename, "caption": caption})
                
                conn.close()
            
            data_json = json.dumps(images)
            
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(data_json.encode("utf-8"))
        except Exception as e:
            print(f"Erro ao listar imagens: {e}")
            self.send_response(500)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
    
    def handle_upload(self):
        try:
            # Verificar limite de 100 imagens
            images_path = Path("imagens")
            if images_path.exists():
                image_count = len([f for f in images_path.iterdir() 
                                  if f.is_file() and f.suffix.lower() in ['.jpg', '.jpeg', '.png', '.gif', '.webp']])
                if image_count >= 100:
                    raise ValueError("Limite de 100 imagens atingido")
            
            content_type = self.headers['Content-Type']
            if not content_type.startswith('multipart/form-data'):
                self.send_error(400, "Content-Type deve ser multipart/form-data")
                return
            
            # Parse form data
            form = cgi.FieldStorage(
                fp=self.rfile,
                headers=self.headers,
                environ={
                    'REQUEST_METHOD': 'POST',
                    'CONTENT_TYPE': content_type,
                }
            )
            
            if 'image' not in form:
                raise ValueError("Nenhuma imagem enviada")
            
            file_item = form['image']
            
            if not file_item.file:
                raise ValueError("Arquivo inválido")
            
            # Gerar nome único
            file_ext = Path(file_item.filename).suffix.lower()
            if file_ext not in ['.jpg', '.jpeg', '.png', '.gif', '.webp']:
                raise ValueError("Formato de imagem não suportado")
            
            unique_filename = f"{uuid.uuid4().hex}{file_ext}"
            file_path = Path("imagens") / unique_filename
            
            # Salvar arquivo
            with open(file_path, 'wb') as f:
                f.write(file_item.file.read())
            
            # Responder com sucesso
            response = json.dumps({"success": True, "filename": unique_filename})
            
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(response.encode("utf-8"))
            
            print(f"Imagem salva: {unique_filename}")
            
        except Exception as e:
            print(f"Erro ao fazer upload: {e}")
            response = json.dumps({"success": False, "error": str(e)})
            
            self.send_response(400)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(response.encode("utf-8"))
    
    def handle_delete(self):
        try:
            # Extrair nome do arquivo da URL
            filename = self.path.split('/')[-1]
            
            # Validar nome do arquivo
            if not filename or '..' in filename or '/' in filename:
                raise ValueError("Nome de arquivo inválido")
            
            # Verificar se o arquivo existe
            file_path = Path("imagens") / filename
            
            if not file_path.exists():
                raise ValueError("Imagem não encontrada")
            
            # Verificar extensão
            if file_path.suffix.lower() not in ['.jpg', '.jpeg', '.png', '.gif', '.webp']:
                raise ValueError("Arquivo não é uma imagem válida")
            
            # Deletar arquivo
            file_path.unlink()
            
            # Deletar legenda do banco de dados
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            cursor.execute('DELETE FROM image_captions WHERE filename = ?', (filename,))
            conn.commit()
            conn.close()
            
            # Responder com sucesso
            response = json.dumps({"success": True, "message": "Imagem excluída com sucesso"})
            
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(response.encode("utf-8"))
            
            print(f"Imagem excluída: {filename}")
            
        except Exception as e:
            print(f"Erro ao excluir imagem: {e}")
            response = json.dumps({"success": False, "error": str(e)})
            
            self.send_response(400)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(response.encode("utf-8"))
    
    def handle_get_caption(self):
        try:
            filename = self.path.split('/')[-1]
            
            if not filename or '..' in filename or '/' in filename:
                raise ValueError("Nome de arquivo inválido")
            
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            cursor.execute('SELECT caption FROM image_captions WHERE filename = ?', (filename,))
            result = cursor.fetchone()
            conn.close()
            
            caption = result[0] if result else ""
            
            response = json.dumps({"success": True, "caption": caption})
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(response.encode("utf-8"))
            
        except Exception as e:
            print(f"Erro ao buscar legenda: {e}")
            response = json.dumps({"success": False, "error": str(e)})
            self.send_response(400)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(response.encode("utf-8"))
    
    def handle_update_caption(self):
        try:
            filename = self.path.split('/')[-1]
            
            if not filename or '..' in filename or '/' in filename:
                raise ValueError("Nome de arquivo inválido")
            
            # Ler o corpo da requisição
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            caption = data.get('caption', '')
            
            # Atualizar ou inserir legenda no banco
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            cursor.execute('''
                INSERT OR REPLACE INTO image_captions (filename, caption)
                VALUES (?, ?)
            ''', (filename, caption))
            conn.commit()
            conn.close()
            
            response = json.dumps({"success": True, "message": "Legenda atualizada"})
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(response.encode("utf-8"))
            
            print(f"Legenda atualizada para {filename}: {caption}")
            
        except Exception as e:
            print(f"Erro ao atualizar legenda: {e}")
            response = json.dumps({"success": False, "error": str(e)})
            self.send_response(400)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(response.encode("utf-8"))
    
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
                # Criar sessão
                if not userId or not userName:
                    print(f"[VERIFY] ❌ userId ou userName não fornecidos!")
                    raise ValueError("userId e userName são obrigatórios")
                
                session_id = str(uuid.uuid4())
                sessions[session_id] = {
                    'userId': userId,
                    'userName': userName,
                    'timestamp': time.time()
                }
                
                response_data = json.dumps({
                    "verified": True,
                    "session_id": session_id
                })
                
                self.send_response(200)
                self.send_header("Content-type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Set-Cookie", f"session_id={session_id}; Path=/; Max-Age=86400; SameSite=Lax")
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
        """Remove a sessão do usuário"""
        try:
            cookie_header = self.headers.get('Cookie', '')
            cookie = SimpleCookie(cookie_header)
            
            if 'session_id' in cookie:
                session_id = cookie['session_id'].value
                if session_id in sessions:
                    print(f"[LOGOUT] Removendo sessão: {session_id}")
                    del sessions[session_id]
            
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


with socketserver.TCPServer(("", PORT), MyHandler) as httpd:
    print(f"Servindo na porta {PORT}...")
    httpd.serve_forever()

