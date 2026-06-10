using InkNote.Models;
using Microsoft.AspNetCore.Mvc;
using HtmlAgilityPack;
using System.Text.RegularExpressions;

namespace InkNote.Controllers;

[ApiController]
[Route("api/linkpreview")]
public class LinkPreviewController(IHttpClientFactory httpClientFactory, ILogger<LinkPreviewController> logger) : ControllerBase
{
    private static readonly Regex YoutubeRegex = new(
        @"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([a-zA-Z0-9_-]{11})",
        RegexOptions.Compiled);

    [HttpGet]
    public async Task<IActionResult> GetPreview([FromQuery] string url)
    {
        if (string.IsNullOrWhiteSpace(url)) return BadRequest("URL required");

        var youtubeId = ExtractYoutubeId(url);
        if (youtubeId != null)
        {
            return Ok(new LinkPreviewResult(
                url, "YouTube Video", null,
                $"https://img.youtube.com/vi/{youtubeId}/hqdefault.jpg",
                "YouTube", true, youtubeId));
        }

        try
        {
            var client = httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(10);
            client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (compatible; InkNote/1.0)");

            var response = await client.GetAsync(url);
            if (!response.IsSuccessStatusCode)
                return Ok(new LinkPreviewResult(url, null, null, null, null, false, null));

            var html = await response.Content.ReadAsStringAsync();
            var doc = new HtmlDocument();
            doc.LoadHtml(html);

            var title = Meta(doc, "og:title") ?? Meta(doc, "twitter:title")
                ?? doc.DocumentNode.SelectSingleNode("//title")?.InnerText?.Trim();
            var description = Meta(doc, "og:description") ?? Meta(doc, "twitter:description")
                ?? Meta(doc, "description");
            var image = Meta(doc, "og:image") ?? Meta(doc, "twitter:image");
            var siteName = Meta(doc, "og:site_name");

            if (image != null && !image.StartsWith("http") && Uri.TryCreate(url, UriKind.Absolute, out var baseUri))
                image = new Uri(baseUri, image).ToString();

            if (description?.Length > 220)
                description = description[..217] + "...";

            return Ok(new LinkPreviewResult(url, title, description, image, siteName, false, null));
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to fetch preview for {Url}", url);
            return Ok(new LinkPreviewResult(url, null, null, null, null, false, null));
        }
    }

    private static string? Meta(HtmlDocument doc, string name)
    {
        var node = doc.DocumentNode.SelectSingleNode($"//meta[@property='{name}']")
            ?? doc.DocumentNode.SelectSingleNode($"//meta[@name='{name}']");
        return node?.GetAttributeValue("content", null);
    }

    private static string? ExtractYoutubeId(string url)
    {
        var m = YoutubeRegex.Match(url);
        return m.Success ? m.Groups[1].Value : null;
    }
}
