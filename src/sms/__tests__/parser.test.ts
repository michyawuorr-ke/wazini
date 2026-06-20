import { parseMpesaSms } from "../parser";

describe("parseMpesaSms", () => {
  it("parses a standard Till confirmation with phone number", () => {
    const sms =
      "TGR47B3X91 Confirmed. You have received Ksh500.00 from EVANS NDUNGU " +
      "254712345678 on 19/6/26 at 2:14 PM. New M-PESA balance is Ksh12,450.00.";

    const result = parseMpesaSms(sms);

    expect(result.mpesaCode).toBe("TGR47B3X91");
    expect(result.amount).toBe(500);
    expect(result.senderName).toBe("EVANS NDUNGU");
    expect(result.senderPhone).toBe("+254712345678");
    expect(result.isLikelyMpesa).toBe(true);
  });

  it("parses an amount with comma grouping", () => {
    const sms =
      "QGH99K2L11 Confirmed. You have received Ksh1,500.00 from MARY WANJIRU on 19/6/26 at 9:00 AM.";

    const result = parseMpesaSms(sms);

    expect(result.amount).toBe(1500);
    expect(result.senderName).toBe("MARY WANJIRU");
  });

  it("handles a sender with no phone number in the message", () => {
    const sms =
      "ABC123XYZ9 Confirmed. You have received Ksh200.00 from JOHN KAMAU on 19/6/26 at 11:00 AM.";

    const result = parseMpesaSms(sms);

    expect(result.mpesaCode).toBe("ABC123XYZ9");
    expect(result.amount).toBe(200);
    expect(result.senderName).toBe("JOHN KAMAU");
    expect(result.senderPhone).toBeNull();
    expect(result.isLikelyMpesa).toBe(true);
  });

  it("normalizes a 07... phone format to E.164", () => {
    const sms =
      "XYZ987ABC1 Confirmed. You have received Ksh300.00 from PETER OTIENO 0712345678 on 19/6/26 at 1:00 PM.";

    const result = parseMpesaSms(sms);

    expect(result.senderPhone).toBe("+254712345678");
  });

  it("returns isLikelyMpesa=false for unrelated SMS (e.g. a bank alert)", () => {
    const sms = "Your account balance is KES 5,000 as of today. Thank you for banking with us.";

    const result = parseMpesaSms(sms);

    expect(result.isLikelyMpesa).toBe(false);
    expect(result.mpesaCode).toBeNull();
  });

  it("returns isLikelyMpesa=false when amount is missing entirely", () => {
    const sms = "TGR47B3X91 Confirmed. Transaction processed successfully.";

    const result = parseMpesaSms(sms);

    expect(result.mpesaCode).toBe("TGR47B3X91");
    expect(result.amount).toBeNull();
    expect(result.isLikelyMpesa).toBe(false);
  });

  it("does not throw on completely malformed/empty input", () => {
    expect(() => parseMpesaSms("")).not.toThrow();
    expect(() => parseMpesaSms("asdkjasdkj random text 12345")).not.toThrow();

    const result = parseMpesaSms("");
    expect(result.isLikelyMpesa).toBe(false);
  });

  it("handles KES prefix instead of Ksh", () => {
    const sms = "DEF456GHI7 Confirmed. You have received KES 750 from GRACE AKINYI on 19/6/26 at 3:00 PM.";

    const result = parseMpesaSms(sms);

    expect(result.amount).toBe(750);
  });
});
