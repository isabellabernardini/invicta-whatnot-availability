import { NextResponse } from "next/server";

type HebcalItem = {
  title?: string;
  date?: string;
  category?: string;
};

type HebcalResponse = {
  items?: HebcalItem[];
};

function isDateString(
  value: string | null
) {
  return Boolean(
    value &&
      /^\d{4}-\d{2}-\d{2}$/.test(
        value
      )
  );
}

export async function GET(
  request: Request
) {
  try {
    const requestUrl =
      new URL(request.url);

    const date =
      requestUrl.searchParams.get(
        "date"
      );

    if (
      !isDateString(date)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "date must be YYYY-MM-DD.",
        },
        {
          status: 400,
        }
      );
    }

    const targetDate =
      new Date(
        `${date}T12:00:00Z`
      );

    const year =
      targetDate.getUTCFullYear();

    const month =
      targetDate.getUTCMonth() + 1;

    const day =
      targetDate.getUTCDate();

    const hebcalUrl =
      new URL(
        "https://www.hebcal.com/shabbat"
      );

    hebcalUrl.searchParams.set(
      "cfg",
      "json"
    );

    hebcalUrl.searchParams.set(
      "zip",
      "33021"
    );

    /*
     * M=on uses Hebcal's nightfall
     * calculation (sun 8.5° below
     * the horizon), matching the
     * observance standard supplied
     * for the team.
     */
    hebcalUrl.searchParams.set(
      "M",
      "on"
    );

    hebcalUrl.searchParams.set(
      "leyning",
      "off"
    );

    hebcalUrl.searchParams.set(
      "gy",
      String(year)
    );

    hebcalUrl.searchParams.set(
      "gm",
      String(month)
    );

    hebcalUrl.searchParams.set(
      "gd",
      String(day)
    );

    const response =
      await fetch(
        hebcalUrl.toString(),
        {
          next: {
            revalidate:
              60 * 60 * 24,
          },
        }
      );

    if (!response.ok) {
      throw new Error(
        `Hebcal returned ${response.status}.`
      );
    }

    const data =
      (await response.json()) as
        HebcalResponse;

    const items =
      data.items ?? [];

    const candle =
      items.find(
        (item) =>
          item.category ===
          "candles"
      );

    const havdalah =
      items.find(
        (item) =>
          item.category ===
          "havdalah"
      );

    if (
      !candle?.date ||
      !havdalah?.date
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Could not find both candle-lighting and Havdalah for this week.",
        },
        {
          status: 502,
        }
      );
    }

    return NextResponse.json({
      ok: true,

      location: {
        zip: "33021",
        label:
          "Hollywood, FL",
      },

      standard: {
        candleLightingMinutesBeforeSunset:
          18,
        havdalah:
          "nightfall_8_5_degrees",
      },

      candleLighting:
        candle.date,

      havdalah:
        havdalah.date,
    });
  } catch (error) {
    console.error(
      "SHABBAT TIMES ERROR",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not load Shabbat times.",
      },
      {
        status: 500,
      }
    );
  }
}
