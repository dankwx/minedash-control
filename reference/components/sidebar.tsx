"use client"

import { Copy } from "lucide-react"
import { Badge } from "@/components/ui/badge"

export function Sidebar() {
  const serverInfo = {
    address: "10.150.135.158:25565",
    isOnline: true,
    players: { current: 3, max: 20 },
    version: "1.21.1",
    mode: "Survival",
  }

  const onlinePlayers = [
    { name: "AllaNaroK", isOnline: true },
    { name: "HermeticPrince", isOnline: true },
    { name: "BITalucard", isOnline: true },
  ]

  const pias = [
    { letter: "A", active: true },
    { letter: "A", active: true },
    { letter: "D", active: true },
    { letter: "L", active: true },
  ]

  const copyAddress = () => {
    navigator.clipboard.writeText(serverInfo.address)
  }

  return (
    <aside className="w-64 border-r border-border/30 p-6 flex flex-col">
      {/* Título */}
      <div className="mb-8">
        <h1 className="font-serif italic text-2xl text-foreground tracking-wide leading-tight">
          MHASSAHRO
          <br />
          POLIS
        </h1>
        <p className="text-muted-foreground text-xs tracking-wider mt-2 font-mono">ALL THE MODS 10 - 5.1</p>
      </div>

      {/* Server Address */}
      <div className="mb-6">
        <span className="text-muted-foreground text-xs tracking-widest block mb-2">SERVER ADDRESS</span>
        <div className="flex items-center gap-2 group cursor-pointer" onClick={copyAddress}>
          <span className="text-foreground font-mono text-sm">{serverInfo.address}</span>
          <Copy className="w-3.5 h-3.5 text-muted-foreground group-hover:text-accent transition-colors" />
        </div>
      </div>

      {/* Status Badge */}
      <div className="mb-6">
        <Badge variant="outline" className="border-online/50 text-online bg-online/10 px-3 py-1 text-xs tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-online mr-2" />
          ONLINE
        </Badge>
      </div>

      {/* Stats */}
      <div className="space-y-3 mb-8 border-t border-border/30 pt-4">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground tracking-widest">PLAYERS</span>
          <span className="text-foreground font-mono">
            {serverInfo.players.current} / {serverInfo.players.max}
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground tracking-widest">VERSION</span>
          <span className="text-foreground font-mono">{serverInfo.version}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground tracking-widest">MODE</span>
          <span className="text-foreground font-mono">{serverInfo.mode}</span>
        </div>
      </div>

      {/* Jogadores Online */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-muted-foreground text-xs tracking-widest">JOGADORES ONLINE</span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-muted text-muted-foreground">
            {onlinePlayers.length}
          </Badge>
        </div>
        <div className="border-l border-accent/40 pl-3 space-y-2">
          {onlinePlayers.map((player) => (
            <div key={player.name} className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-online" />
              <span className="text-foreground text-sm">{player.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* PIAS */}
      <div className="mt-auto">
        <span className="text-muted-foreground text-xs tracking-widest block mb-3 border-t border-border/30 pt-4">
          PIAS
        </span>
        <div className="border-l border-border/30 pl-3 space-y-1">
          {pias.map((pia, index) => (
            <div key={index} className="text-accent text-sm font-mono">
              {pia.letter}
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}
