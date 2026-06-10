using InkNote.Models;
using Microsoft.EntityFrameworkCore;

namespace InkNote.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Notebook> Notebooks => Set<Notebook>();
    public DbSet<Page> Pages => Set<Page>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Notebook>().HasIndex(n => n.UpdatedAt);
        modelBuilder.Entity<Page>().HasIndex(p => p.NotebookId);
        modelBuilder.Entity<Page>().HasIndex(p => p.UpdatedAt);
    }
}
