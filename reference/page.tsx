import { Sidebar } from "@/components/sidebar"
import { TopHeader } from "@/components/top-header"
import { PlayerCards } from "@/components/player-cards"

export default function Home() {
  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar esquerda - estrutura original */}
      <Sidebar />

      {/* Conteúdo principal */}
      <main className="flex-1 flex flex-col">
        {/* Header com CPU/RAM e botões */}
        <TopHeader />

        {/* Área de status com cards de jogadores */}
        <div className="flex-1 p-8">
          <div className="flex items-center justify-between mb-6">
            <span className="text-muted-foreground text-xs tracking-widest font-mono">// STATUS</span>
            <span className="text-muted-foreground text-xs">3 online agora</span>
          </div>

          {/* Grid de player cards */}
          <PlayerCards />
        </div>
      </main>

      {/* Avatares no canto inferior direito */}
      <div className="fixed bottom-6 right-6 flex items-center">
        <div className="flex -space-x-2">
          <img
            src="https://mc-heads.net/avatar/HermeticPrince/32"
            alt="Player"
            className="w-8 h-8 rounded-full border-2 border-background"
            style={{ imageRendering: "pixelated" }}
          />
          <img
            src="https://mc-heads.net/avatar/BITalucard/32"
            alt="Player"
            className="w-8 h-8 rounded-full border-2 border-background"
            style={{ imageRendering: "pixelated" }}
          />
        </div>
        <span className="ml-2 text-muted-foreground text-xs">3</span>
      </div>
    </div>
  )
}
