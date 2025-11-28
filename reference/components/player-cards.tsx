import { Clock, Calendar } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

type TopPlayer = {
  rank: number
  name: string
  avatar: string
  playtime: { hours: number; minutes: number }
  lastSeen: string
  isOnline: boolean
  progress: number
}

export function PlayerCards() {
  const topPlayers: TopPlayer[] = [
    {
      rank: 1,
      name: "HermeticPrince",
      avatar: "https://mc-heads.net/avatar/HermeticPrince/48",
      playtime: { hours: 4, minutes: 2 },
      lastSeen: "1H",
      isOnline: true,
      progress: 100,
    },
    {
      rank: 2,
      name: "BITalucard",
      avatar: "https://mc-heads.net/avatar/BITalucard/48",
      playtime: { hours: 3, minutes: 42 },
      lastSeen: "2H",
      isOnline: false,
      progress: 85,
    },
    {
      rank: 3,
      name: "AllaNaroK",
      avatar: "https://mc-heads.net/avatar/AllaNaroK/48",
      playtime: { hours: 3, minutes: 19 },
      lastSeen: "23 MIN",
      isOnline: true,
      progress: 75,
    },
    {
      rank: 4,
      name: "abcdan",
      avatar: "https://mc-heads.net/avatar/abcdan/48",
      playtime: { hours: 2, minutes: 47 },
      lastSeen: "16H",
      isOnline: false,
      progress: 60,
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {topPlayers.map((player) => (
        <Card
          key={player.rank}
          className="relative bg-card/50 border-border/30 p-5 hover:border-accent/30 transition-colors group"
        >
          {/* Rank Badge */}
          <Badge className="absolute -top-2 -left-2 w-6 h-6 rounded-full flex items-center justify-center p-0 bg-foreground text-background text-xs font-mono">
            {player.rank}
          </Badge>

          {/* Online indicator */}
          {player.isOnline && <span className="absolute top-3 right-3 w-2 h-2 bg-online rounded-full" />}

          {/* Player info */}
          <div className="flex items-center gap-3 mb-4">
            <img
              src={player.avatar || "/placeholder.svg"}
              alt={player.name}
              className="w-10 h-10"
              style={{ imageRendering: "pixelated" }}
            />
            <span className="text-foreground text-sm font-medium">{player.name}</span>
          </div>

          {/* Playtime */}
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-foreground text-lg font-mono">
              {player.playtime.hours}h {player.playtime.minutes.toString().padStart(2, "0")}m
            </span>
          </div>

          {/* Last seen */}
          <div className="flex items-center gap-2 mb-4 text-muted-foreground">
            <Calendar className="w-3 h-3" />
            <span className="text-xs font-mono">HÁ {player.lastSeen}</span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-0.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-muted-foreground/30 rounded-full transition-all group-hover:bg-accent/50"
              style={{ width: `${player.progress}%` }}
            />
          </div>
        </Card>
      ))}
    </div>
  )
}
