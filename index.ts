import { bold, EmbedBuilder, userMention, WebhookClient } from "discord.js";

interface OvhResponse {
  fqn: string;
  memory: string;
  planCode: string;
  server: string;
  storage: string;
  datacenters: OVHDatacenter[];
}

interface OVHDatacenter {
  availability: 'unavailable' | string;
  datacenter: keyof typeof DatacenterLocalization;
}

enum DatacenterLocalization {
  bhs = 'Canada (Beauharnois - BHS)',
  fra = 'Allemagne (Francfort - FRA)',
  gra = 'France (Gravelines - GRA)',
  lon = 'Royaume-Uni (Londres - LON)',
  rbx = 'France (Roubaix - RBX)',
  sbg = 'France (Strasbourg - SBG)',
  waw = 'Pologne (Varsovie - WAW)',
}

class OvhKSAWatcher extends WebhookClient {
  private alreadyKnownLocations: string[] = []

  constructor() {
    if (!Bun.env.DISCORD_WEBHOOK_URL) {
      console.error('DISCORD_WEBHOOK is not defined');
      return;
    }

    super({ url: Bun.env.DISCORD_WEBHOOK_URL });
  }

  async sendToWebhook(res: OvhResponse, dc: OVHDatacenter): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle(dc.availability === 'unavailable' ? 'Serveur KS-A indisponible' : 'Nouveau serveur KS-A disponible')
      .setDescription(dc.availability === 'unavailable' ?
        `Le serveur KS-A en ${bold(DatacenterLocalization[dc.datacenter] || dc.datacenter)} est de nouveau indisponible` :
        `Un nouveau serveur KS-A est disponible en ${bold(DatacenterLocalization[dc.datacenter] || dc.datacenter)}`)
      .setURL('https://eco.ovhcloud.com/fr/kimsufi/ks-a/')
      .addFields({
        name: 'Serveur',
        value: res.server,
        inline: true,
      }, {
        name: 'Stockage',
        value: res.storage,
        inline: true,
      }, {
        name: 'Mémoire',
        value: res.memory,
        inline: true,
      })
      .setColor(dc.availability === 'unavailable' ? 'Red' : 'Green')
      .setTimestamp();

    console.log(embed.toJSON());

    await this.send({
      embeds: [embed],
      username: 'OVH KS-A Watcher',
      ...(Bun.env.DISCORD_OWNER_ID ? { content: userMention(Bun.env.DISCORD_OWNER_ID) } : {})
    });
  }

  async watch(): Promise<void> {
    const res = await fetch('https://www.ovh.com/engine/apiv6/dedicated/server/datacenter/availabilities/?excludeDatacenters=false&planCode=24ska01&server=24ska01', {
      method: 'GET',
    });

    const data = await res.json() as OvhResponse[];

    data.forEach(async (item) => {
      item.datacenters.forEach(async (dc) => {
        if (dc.availability === 'unavailable' && this.alreadyKnownLocations.includes(dc.datacenter)) { 
          await this.sendToWebhook(item, dc);
          this.alreadyKnownLocations = this.alreadyKnownLocations.filter((loc) => loc !== dc.datacenter);
          console.log(this.alreadyKnownLocations);
          return;
        }

        if (dc.availability === 'unavailable') {
          return;
        }

        if (this.alreadyKnownLocations.includes(dc.datacenter)) {
          return;
        }

        await this.sendToWebhook(item, dc);
        this.alreadyKnownLocations.push(dc.datacenter);
      });
    });
  }

  async start(): Promise<void> {
    await this.watch();
    setInterval(() => this.watch(), 60000); // 60 seconds by default
  }
}

new OvhKSAWatcher().start();