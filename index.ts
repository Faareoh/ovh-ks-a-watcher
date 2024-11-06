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

class Server {
  public readonly NAME: string;

  public readonly SERVER_CODE: string;

  public readonly WEB_CODE: string;

  private readonly API_BASE_URL = 'https://www.ovh.com/engine/apiv6/dedicated/server/datacenter/availabilities/?excludeDatacenters=false';

  private readonly WEB_BASE_URL = 'https://eco.ovhcloud.com/fr/kimsufi';

  constructor(NAME: string, SERVER_CODE: string, WEB_CODE: string) {
    this.NAME = NAME;
    this.SERVER_CODE = SERVER_CODE;
    this.WEB_CODE = WEB_CODE;
  }

  public getApiURL(): string {
    return `${this.API_BASE_URL}&planCode=${this.SERVER_CODE}&server${this.SERVER_CODE}`;
  }

  public getWebURL(): string {
    return `${this.WEB_BASE_URL}/${this.WEB_CODE}/`;
  }
}

const SERVERS: Server[] = [
  new Server('KS-A', '24ska01', 'ks-a'),
  new Server('KS-LE-B', '25skleb01', 'ks-le-b')
];



class OvhKSAWatcher extends WebhookClient {
  private alreadyKnownLocations: { location: string, serverType: string }[] = [];

  constructor() {
    if (!Bun.env.DISCORD_WEBHOOK_URL) {
      console.error('DISCORD_WEBHOOK is not defined');
      return;
    }

    super({ url: Bun.env.DISCORD_WEBHOOK_URL });
  }

  async sendToWebhook(server: Server, res: OvhResponse, dc: OVHDatacenter): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle(dc.availability === 'unavailable' ? `Serveur ${server.NAME} indisponible` : `Nouveau serveur ${server.NAME} disponible:`)
      .setDescription(dc.availability === 'unavailable' ?
        `Le serveur ${server.NAME} en ${bold(DatacenterLocalization[dc.datacenter] || dc.datacenter)} est de nouveau indisponible` :
        `Un nouveau serveur ${server.NAME} est disponible en ${bold(DatacenterLocalization[dc.datacenter] || dc.datacenter)}`)
      .setURL(server.getWebURL())
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

    await this.send({
      embeds: [embed],
      username: `OVH ${server.NAME} Watcher`,
      ...(Bun.env.DISCORD_OWNER_ID ? { content: userMention(Bun.env.DISCORD_OWNER_ID) } : {})
    });
  }

  async watch(): Promise<void> {
    SERVERS.forEach(async (server) => {
      const res = await fetch(server.getApiURL(), {
        method: 'GET',
      });

      const data = await res.json() as OvhResponse[];

      data.forEach(async (item) => {
        item.datacenters.forEach(async (dc) => {
          if (dc.availability === 'unavailable' && this.alreadyKnownLocations.some((loc) => loc.location === dc.datacenter && loc.serverType === server.NAME)) {
            await this.sendToWebhook(server, item, dc);
            this.alreadyKnownLocations = this.alreadyKnownLocations.filter((loc) => loc.location !== dc.datacenter && loc.serverType !== server.NAME);
            return;
          }

          if (dc.availability === 'unavailable') {
            return;
          }

          if (this.alreadyKnownLocations.some((loc) => loc.location === dc.datacenter && loc.serverType === server.NAME)) {
            return;
          }

          await this.sendToWebhook(server, item, dc);
          this.alreadyKnownLocations.push({ location: dc.datacenter, serverType: server.NAME });
        });
      });
    });
  }

  async start(): Promise<void> {
    await this.send({ content: 'Lancement du watcher KS', username: 'OVH KS Watcher' });
    await this.watch();
    setInterval(() => this.watch(), 30000);
  }
}

new OvhKSAWatcher().start();