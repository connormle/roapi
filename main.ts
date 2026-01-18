import { $fetch } from "ofetch";

const useragent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.111 Safari/537.36";

const authurl = "https://auth.roblox.com/v2/logout";
const baseversion = 2;
const updateversion = 2.0;

/* ---------------- VERSION CHECK ---------------- */

(async () => {
  const githubversion = await $fetch<any>("https://versionsroapi.pythonanywhere.com/");

  if (githubversion.base !== baseversion) {
    console.log(
      "New release found for rogamepass.py Please Download latest version at https://github.com/sesocellgames/rogamepass.py/releases/"
    );
  } else if (githubversion.update !== updateversion) {
    console.log(
      "New update found for rogamepass.py Please Download latest version at https://github.com/sesocellgames/rogamepass.py/releases/"
    );
  }
})();

/* ---------------- INFO ---------------- */

class Info {
  static async getXsrf(cookie: string): Promise<string> {
    try {
      await $fetch(authurl, {
        method: "POST",
        headers: {
          "User-Agent": useragent,
          cookie: `.ROBLOSECURITY=${cookie}`,
        },
      });
      return "";
    } catch (err: any) {
      return err?.response?.headers?.get("x-csrf-token") ?? "";
    }
  }

  static async getHeaders(cookie: string) {
    const token = await this.getXsrf(cookie);
    return {
      "X-CSRF-TOKEN": token,
      cookie: `.ROBLOSECURITY=${cookie}`,
    };
  }

  static async getUserId(cookie: string): Promise<number> {
    const headers = await this.getHeaders(cookie);
    const res = await $fetch<any>(
      "https://users.roblox.com/v1/users/authenticated",
      { headers }
    );
    return res.id;
  }

  static getInfoRequestUrl(id: number): string {
    return `https://apis.roblox.com/game-passes/v1/game-passes/${id}/product-info`;
  }

  static async getInfo(id: number): Promise<[number, number, number]> {
    const res = await $fetch<any>(this.getInfoRequestUrl(id));
    return [
      res.ProductId,
      res.Creator.Id,
      res.PriceInRobux,
    ];
  }

  static async getUserIdByUsername(username: string): Promise<number> {
    const res = await $fetch<any>(
      "https://users.roblox.com/v1/usernames/users",
      {
        method: "POST",
        body: { usernames: [username] },
      }
    );
    return res.data[0].id;
  }

  static async getGamepasses(username: string): Promise<number[][]> {
    const userId = await this.getUserIdByUsername(username);

    const games = await $fetch<any>(
      `https://games.roblox.com/v2/users/${userId}/games?accessFilter=Public&limit=50`
    );

    const gamepasses: number[][] = [];

    for (const game of games.data) {
      const res = await $fetch<any>(
        `https://games.roblox.com/v1/games/${game.id}/game-passes?limit=100&sortOrder=Asc`
      );

      for (const pass of res.data) {
        if (pass.price !== null) {
          gamepasses.push([pass.id, pass.price]);
        }
      }
    }

    return gamepasses;
  }
}

/* ---------------- DELETE ---------------- */

class Deletor {
  constructor(private cookie: string) {}

  async gamepass(passid: number) {
    const headers = await Info.getHeaders(this.cookie);
    await $fetch("https://www.roblox.com/game-pass/revoke", {
      method: "POST",
      body: { id: passid },
      headers,
    });
    console.log("Gamepass Deleting Done!");
  }
}

/* ---------------- BUYER ---------------- */

class Buyer {
  constructor(private cookie: string) {}

  async buy(deleteAfter: boolean, id: number) {
    const info = await Info.getInfo(id);
    const headers = await Info.getHeaders(this.cookie);

    await $fetch(
      `https://economy.roblox.com/v1/purchases/products/${info[0]}`,
      {
        method: "POST",
        headers,
        body: {
          expectedCurrency: 1,
          expectedPrice: info[2],
          expectedSellerId: info[1],
        },
      }
    );

    if (deleteAfter) {
      await new Deletor(this.cookie).gamepass(id);
    }
  }

  async getRobuxAmount(): Promise<number> {
    const headers = await Info.getHeaders(this.cookie);
    const userId = await Info.getUserId(this.cookie);

    const res = await $fetch<any>(
      `https://economy.roblox.com/v1/users/${userId}/currency`,
      { headers }
    );

    return res.robux;
  }

  async autoBuy(id: number, amount: number, cooldown: number) {
    for (let i = 0; i < amount; i++) {
      await new Promise((r) => setTimeout(r, cooldown * 1000));
      await this.buy(true, id);
    }
  }

  async donate(username: string, amount: number) {
    let total = 0;
    const passes = await Info.getGamepasses(username);

    for (const pass of passes) {
      if (total + pass[1] <= amount) {
        total += pass[1];
        await this.buy(true, pass[0]);
      }
    }

    return total === amount
      ? "success"
      : `Not found gamepass, Sended ${total} Wanted ${amount}`;
  }
}

/* ---------------- GAMEPASS ---------------- */

class Gamepass {
  constructor(private cookie?: string) {}

  async doOffsale(passid: number) {
    if (!this.cookie) return;
    const headers = await Info.getHeaders(this.cookie);

    await $fetch(
      `https://apis.roblox.com/game-passes/v1/game-passes/${passid}/details`,
      {
        method: "POST",
        headers,
        body: { IsForSale: "false" },
      }
    );
  }

  async editGamepass(passid: number, data: any) {
    if (!this.cookie) return;
    const headers = await Info.getHeaders(this.cookie);

    await $fetch(
      `https://apis.roblox.com/game-passes/v1/game-passes/${passid}/details`,
      {
        method: "POST",
        headers,
        body: data,
      }
    );
  }

  async checkOwn(userId: number, passid: number): Promise<boolean> {
    const res = await $fetch<any>(
      `https://inventory.roblox.com/v1/users/${userId}/items/GamePass/${passid}`
    );
    return res.data.length !== 0;
  }

  async checkBought(passid: number): Promise<boolean> {
    if (!this.cookie) return false;
    const headers = await Info.getHeaders(this.cookie);

    const res = await $fetch<any>(
      `https://apis.roblox.com/game-passes/v1/game-passes/${passid}/details`,
      { headers }
    );

    return res.gamePassSalesData.totalSales >= 1;
  }

  async passCreator(amount: number, universeid: number): Promise<string> {
    if (!this.cookie) return "Error";
    const headers = await Info.getHeaders(this.cookie);

    const create = await $fetch<any>(
      "https://apis.roblox.com/game-passes/v1/game-passes",
      {
        method: "POST",
        headers,
        body: {
          Name: "Gamepass Name",
          UniverseId: universeid,
        },
      }
    );

    try {
      const passid = create.gamePassId;

      await $fetch(
        `https://apis.roblox.com/game-passes/v1/game-passes/${passid}/details`,
        {
          method: "POST",
          headers,
          body: { IsForSale: "true", Price: amount },
        }
      );

      return String(passid);
    } catch {
      return "Error";
    }
  }
}