using System.Net.Http.Headers;
using System.Net.Http.Json;

public sealed class SpmtClient
{
    private readonly HttpClient http;

    public SpmtClient(string apiKey, string baseUrl = "https://spmt.live")
    {
        http = new HttpClient { BaseAddress = new Uri(baseUrl.TrimEnd('/') + "/") };
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
    }

    public async Task<string> PublishGameEventAsync(
        string eventType,
        object payload,
        CancellationToken cancellationToken = default)
    {
        var body = new
        {
            type = eventType.StartsWith("game.") ? eventType : $"game.{eventType}",
            sourceApp = "atherrea",
            visibility = "creator",
            payload
        };

        using var response = await http.PostAsJsonAsync("api/platform/events", body, cancellationToken);
        var json = await response.Content.ReadAsStringAsync(cancellationToken);
        response.EnsureSuccessStatusCode();
        return json;
    }
}
