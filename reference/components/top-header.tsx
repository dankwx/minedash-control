"use client"

import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useState } from "react"

export function TopHeader() {
  const [isDark, setIsDark] = useState(true)

  const stats = {
    cpu: 50.0,
    ram: 64.5,
  }

  return (
    <header className="flex items-center justify-between px-8 py-4 border-b border-border/30">
      {/* Left side - Date and metrics */}
      <div className="flex items-center gap-6">
        <span className="text-muted-foreground text-xs font-mono">27/11/2025 18:46</span>

        {/* CPU Bar */}
        <div className="flex items-center gap-2 px-3 py-1.5 border border-border/50 rounded">
          <span className="text-muted-foreground text-xs font-mono">CPU</span>
          <span className="text-foreground text-xs font-mono font-medium">{stats.cpu}%</span>
          <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-foreground rounded-full" style={{ width: `${stats.cpu}%` }} />
          </div>
        </div>

        {/* RAM Bar */}
        <div className="flex items-center gap-2 px-3 py-1.5 border border-border/50 rounded">
          <span className="text-muted-foreground text-xs font-mono">RAM</span>
          <span className="text-online text-xs font-mono font-medium">{stats.ram}%</span>
          <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-online rounded-full" style={{ width: `${stats.ram}%` }} />
          </div>
        </div>
      </div>

      {/* Right side - Action buttons */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          className="text-xs font-mono tracking-wider border-border/50 hover:bg-accent/10 hover:text-accent hover:border-accent/50 bg-transparent"
        >
          [ VER_LOGS ]
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="text-xs font-mono tracking-wider border-border/50 hover:bg-accent/10 hover:text-accent hover:border-accent/50 bg-transparent"
        >
          [ MAPA 3D ]
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="text-xs font-mono tracking-wider border-border/50 hover:bg-accent/10 gap-2 bg-transparent"
            >
              <img
                src="https://mc-heads.net/avatar/Steve/16"
                alt="User"
                className="w-4 h-4"
                style={{ imageRendering: "pixelated" }}
              />
              DANOS
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-card border-border/50">
            <DropdownMenuItem className="text-xs font-mono">Perfil</DropdownMenuItem>
            <DropdownMenuItem className="text-xs font-mono">Configurações</DropdownMenuItem>
            <DropdownMenuItem className="text-xs font-mono">Sair</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="icon" className="w-9 h-9 rounded-full" onClick={() => setIsDark(!isDark)}>
          {isDark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </Button>
      </div>
    </header>
  )
}
