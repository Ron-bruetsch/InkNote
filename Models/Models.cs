namespace InkNote.Models;

public class Notebook
{
    public int Id { get; set; }
    public string Name { get; set; } = "Untitled";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public List<Page> Pages { get; set; } = [];
}

public class Page
{
    public int Id { get; set; }
    public int NotebookId { get; set; }
    public string Title { get; set; } = "Untitled Page";
    public byte[]? DrawingData { get; set; } // GZip-compressed JSON
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public Notebook? Notebook { get; set; }
}

public record NotebookDto(int Id, string Name, DateTime CreatedAt, DateTime UpdatedAt);
public record PageDto(int Id, int NotebookId, string Title, DateTime CreatedAt, DateTime UpdatedAt);
public record CreateNotebookRequest(string Name);
public record CreatePageRequest(string Title);
public record UpdateTitleRequest(string Title);
public record SaveDrawingRequest(string CompressedData);
public record LinkPreviewResult(
    string Url,
    string? Title,
    string? Description,
    string? ImageUrl,
    string? SiteName,
    bool IsYoutube,
    string? YoutubeId
);
