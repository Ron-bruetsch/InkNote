using InkNote.Data;
using InkNote.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace InkNote.Controllers;

[ApiController]
[Route("api/notebooks")]
public class NotebooksController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var notebooks = await db.Notebooks
            .OrderByDescending(n => n.UpdatedAt)
            .Select(n => new NotebookDto(n.Id, n.Name, n.CreatedAt, n.UpdatedAt))
            .ToListAsync();
        return Ok(notebooks);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateNotebookRequest req)
    {
        var nb = new Notebook { Name = req.Name };
        db.Notebooks.Add(nb);
        await db.SaveChangesAsync();

        var page = new Page { NotebookId = nb.Id, Title = "Page 1" };
        db.Pages.Add(page);
        await db.SaveChangesAsync();

        return Ok(new NotebookDto(nb.Id, nb.Name, nb.CreatedAt, nb.UpdatedAt));
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Rename(int id, [FromBody] UpdateTitleRequest req)
    {
        var nb = await db.Notebooks.FindAsync(id);
        if (nb == null) return NotFound();
        nb.Name = req.Title;
        nb.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(new NotebookDto(nb.Id, nb.Name, nb.CreatedAt, nb.UpdatedAt));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        var nb = await db.Notebooks
            .Include(n => n.Pages)
            .FirstOrDefaultAsync(n => n.Id == id);
        if (nb == null) return NotFound();
        db.Notebooks.Remove(nb);
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpGet("{id}/pages")]
    public async Task<IActionResult> GetPages(int id)
    {
        var pages = await db.Pages
            .Where(p => p.NotebookId == id)
            .OrderBy(p => p.CreatedAt)
            .Select(p => new PageDto(p.Id, p.NotebookId, p.Title, p.CreatedAt, p.UpdatedAt))
            .ToListAsync();
        return Ok(pages);
    }

    [HttpPost("{id}/pages")]
    public async Task<IActionResult> CreatePage(int id, [FromBody] CreatePageRequest req)
    {
        if (!await db.Notebooks.AnyAsync(n => n.Id == id)) return NotFound();
        var page = new Page { NotebookId = id, Title = req.Title };
        db.Pages.Add(page);
        await db.SaveChangesAsync();
        return Ok(new PageDto(page.Id, page.NotebookId, page.Title, page.CreatedAt, page.UpdatedAt));
    }
}
