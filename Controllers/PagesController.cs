using InkNote.Data;
using InkNote.Models;
using Microsoft.AspNetCore.Mvc;

namespace InkNote.Controllers;

[ApiController]
[Route("api/pages")]
public class PagesController(AppDbContext db) : ControllerBase
{
    [HttpPut("{id}/title")]
    public async Task<IActionResult> UpdateTitle(int id, [FromBody] UpdateTitleRequest req)
    {
        var page = await db.Pages.FindAsync(id);
        if (page == null) return NotFound();
        page.Title = req.Title;
        page.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(new PageDto(page.Id, page.NotebookId, page.Title, page.CreatedAt, page.UpdatedAt));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        var page = await db.Pages.FindAsync(id);
        if (page == null) return NotFound();
        db.Pages.Remove(page);
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpGet("{id}/drawing")]
    public async Task<IActionResult> GetDrawing(int id)
    {
        var page = await db.Pages.FindAsync(id);
        if (page == null) return NotFound();
        if (page.DrawingData == null) return Ok(new { data = (string?)null });
        return Ok(new { data = Convert.ToBase64String(page.DrawingData) });
    }

    [HttpPut("{id}/drawing")]
    public async Task<IActionResult> SaveDrawing(int id, [FromBody] SaveDrawingRequest req)
    {
        var page = await db.Pages.FindAsync(id);
        if (page == null) return NotFound();

        page.DrawingData = Convert.FromBase64String(req.CompressedData);
        page.UpdatedAt = DateTime.UtcNow;

        var nb = await db.Notebooks.FindAsync(page.NotebookId);
        if (nb != null) nb.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync();
        return Ok();
    }
}
